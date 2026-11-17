from datetime import datetime, date, timedelta
from typing import Optional, Union
import unicodedata
import pandas as pd
from sqlalchemy.orm import Session

SPANISH_DAYS: list[str] = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

def _normalize_day(d_name: str) -> str:
    if not d_name:
        return ""
    nfkd = unicodedata.normalize('NFKD', str(d_name))
    no_accents = "".join([c for c in nfkd if not unicodedata.combining(c)])
    return no_accents.strip().lower()

from database.connection import get_db_session
from database.schema import Teacher, Designation, Attendance, Substitution, Subject, Career
from models.normative import (
    NormativeClassifier,
    DEFAULT_OFFICE_CODE,
    STATUS_PRESENTE,
    STATUS_AUSENTE_AVISO,
    STATUS_AUSENTE_SIN_AVISO,
    STATUS_LICENCIA,
    MEDICAL_ARTICLES,
    NON_MEDICAL_ARTICLES
)


class AttendanceProcessor:
    @staticmethod
    def _is_consecutive(d1: date, d2: date, bridge_weekends: bool = True) -> bool:
        diff = (d2 - d1).days
        if diff == 1:
            return True
        if bridge_weekends and diff <= 3:
            if d1.weekday() == 4 and d2.weekday() == 0:
                return True
            if d1.weekday() == 5 and d2.weekday() == 0:
                return True
        return False

    @staticmethod
    def group_consecutive_days(records: list[dict], bridge_weekends: bool = True) -> list[dict]:
        if not records:
            return []

        sorted_records = sorted(records, key=lambda r: r["date"])

        grouped: list[dict] = []
        current_block: list[dict] = []

        for rec in sorted_records:
            if rec.get("is_absence", False):
                if current_block:
                    grouped.append(AttendanceProcessor._consolidate_block(current_block))
                    current_block = []

                d_str = rec["date"].strftime("%d/%m/%Y")
                obs = rec.get("observations", "")
                motivo = rec.get("reason") or rec.get("status") or "Inasistencia"
                grouped.append({
                    "teacher_id": rec["teacher_id"],
                    "dni": rec["dni"],
                    "full_name": rec["full_name"],
                    "revista": rec["revista"],
                    "cargo": rec["cargo"],
                    "target_table": "DL-02",
                    "reason": motivo,
                    "date_from": d_str,
                    "date_to": d_str,
                    "total_days": 1,
                    "observations": obs,
                    "start_date_obj": rec["date"],
                    "end_date_obj": rec["date"]
                })
                continue

            if not current_block:
                current_block.append(rec)
            else:
                last_rec = current_block[-1]
                same_reason = (last_rec.get("reason") == rec.get("reason") and
                               last_rec.get("target_table") == rec.get("target_table"))
                consecutive = AttendanceProcessor._is_consecutive(last_rec["date"], rec["date"], bridge_weekends)

                if same_reason and consecutive:
                    current_block.append(rec)
                else:
                    grouped.append(AttendanceProcessor._consolidate_block(current_block))
                    current_block = [rec]

        if current_block:
            grouped.append(AttendanceProcessor._consolidate_block(current_block))

        return grouped

    @staticmethod
    def _consolidate_block(block: list[dict]) -> dict:
        first = block[0]
        last = block[-1]

        start_d: date = first["date"]
        end_d: date = last["date"]
        total_days = (end_d - start_d).days + 1

        observations_set = []
        for r in block:
            obs = (r.get("observations") or "").strip()
            if obs and obs not in observations_set:
                observations_set.append(obs)
        combined_obs = " | ".join(observations_set)

        return {
            "teacher_id": first["teacher_id"],
            "dni": first["dni"],
            "full_name": first["full_name"],
            "revista": first["revista"],
            "cargo": first["cargo"],
            "target_table": first.get("target_table", "DL-01"),
            "reason": first.get("reason", "Licencia"),
            "date_from": start_d.strftime("%d/%m/%Y"),
            "date_to": end_d.strftime("%d/%m/%Y"),
            "total_days": total_days,
            "observations": combined_obs,
            "start_date_obj": start_d,
            "end_date_obj": end_d
        }

    @classmethod
    def process_monthly_attendance(
        cls,
        month: int,
        year: Optional[int] = None,
        career_id: Optional[int] = None,
        session: Optional[Session] = None
    ) -> tuple[pd.DataFrame, pd.DataFrame]:
        close_session_at_end = False
        if session is None:
            session = get_db_session()
            close_session_at_end = True

        current_year = NormativeClassifier.get_current_academic_year()
        report_year = int(year) if year else current_year
        office_code = NormativeClassifier.get_default_office()

        try:
            first_day = date(report_year, month, 1)
            if month == 12:
                last_day = date(report_year, 12, 31)
            else:
                last_day = date(report_year, month + 1, 1) - timedelta(days=1)

            att_query = session.query(Attendance).join(Teacher).filter(
                Attendance.date >= first_day,
                Attendance.date <= last_day,
                Attendance.is_active == True
            )

            if career_id and career_id != 0:
                att_query = att_query.join(
                    Designation, Designation.teacher_id == Teacher.id
                ).join(
                    Subject, Subject.id == Designation.subject_id
                ).filter(
                    Subject.career_id == career_id
                )

            attendances = att_query.order_by(Teacher.last_name, Teacher.first_name, Attendance.date).all()

            raw_records_by_teacher: dict[int, list[dict]] = {}

            for att in attendances:
                st = att.status or ""
                obs = att.observations or ""
                t = att.teacher

                target_table = NormativeClassifier.classify_target_table(st, obs)
                if target_table in ("PRESENTE", "IGNORAR"):
                    continue

                is_abs = NormativeClassifier.is_absence(st, obs)

                desig = att.designation
                if not desig and t.designations:
                    active_desigs = [d for d in t.designations if d.is_active]
                    desig = active_desigs[0] if active_desigs else t.designations[0]

                cargo_desc = desig.effective_cargo if desig else "Docente de Planta"
                revista_code = desig.effective_revista if desig else NormativeClassifier.normalize_revista(t.revista)

                reason_desc = obs if obs else st
                if target_table == "DL-01":
                    if not any(k in obs.lower() for k in ("art", "enferm", "salud")):
                        reason_desc = MEDICAL_ARTICLES["ART_48"] if not obs else f"Art. 48 Salud ({obs})"

                record_item = {
                    "teacher_id": t.id,
                    "dni": NormativeClassifier.normalize_dni(t.dni),
                    "full_name": t.full_name,
                    "revista": revista_code,
                    "cargo": cargo_desc,
                    "date": att.date,
                    "status": st,
                    "observations": obs,
                    "target_table": target_table,
                    "is_absence": is_abs,
                    "reason": reason_desc
                }

                if t.id not in raw_records_by_teacher:
                    raw_records_by_teacher[t.id] = []
                raw_records_by_teacher[t.id].append(record_item)

            sub_query = session.query(Substitution).join(Teacher, Substitution.titular_teacher_id == Teacher.id).filter(
                Substitution.is_active == True,
                Substitution.start_date <= last_day,
                Substitution.end_date >= first_day
            )
            if career_id and career_id != 0:
                sub_query = sub_query.join(Designation).join(Subject).filter(Subject.career_id == career_id)

            substitutions = sub_query.all()
            for sub in substitutions:
                t = sub.titular
                if not t:
                    continue
                eff_start = max(sub.start_date, first_day)
                eff_end = min(sub.end_date, last_day)

                existing_dates = {r["date"] for r in raw_records_by_teacher.get(t.id, [])}
                curr_d = eff_start
                while curr_d <= eff_end:
                    if curr_d not in existing_dates:
                        tgt = "DL-01" if NormativeClassifier.is_medical_license("Licencia", sub.license_reason) else "DL-02"
                        rec = {
                            "teacher_id": t.id,
                            "dni": NormativeClassifier.normalize_dni(t.dni),
                            "full_name": t.full_name,
                            "revista": sub.designation.effective_revista if sub.designation else "TIT",
                            "cargo": sub.designation.effective_cargo if sub.designation else "Cátedra",
                            "date": curr_d,
                            "status": "Licencia",
                            "observations": f"Res. {sub.resolution_number} - {sub.license_reason}",
                            "target_table": tgt,
                            "is_absence": False,
                            "reason": sub.license_reason
                        }
                        if t.id not in raw_records_by_teacher:
                            raw_records_by_teacher[t.id] = []
                        raw_records_by_teacher[t.id].append(rec)
                    curr_d += timedelta(days=1)

            rows_dl01: list[dict] = []
            rows_dl02: list[dict] = []
            disposicion_counter = 1

            for tid, t_records in raw_records_by_teacher.items():
                t = session.query(Teacher).get(tid)
                teacher_active_desigs = [d for d in t.designations if d.is_active] if t else []

                recs_dl01 = [r for r in t_records if r["target_table"] in ("DL-01", "IL-01")]
                recs_dl02 = [r for r in t_records if r["target_table"] in ("DL-02", "IL-02")]

                grouped_01 = cls.group_consecutive_days(recs_dl01, bridge_weekends=True)
                grouped_02 = cls.group_consecutive_days(recs_dl02, bridge_weekends=True)

                for g in grouped_01:
                    disp_str = f"Disp. N° {disposicion_counter:03d}/{report_year}"
                    disposicion_counter += 1

                    rows_dl01.append({
                        "Oficina": office_code,
                        "Año": report_year,
                        "Mes": month,
                        "DNI": str(g["dni"]),
                        "Apellido y Nombres": g["full_name"],
                        "Situación de Revista": g["revista"],
                        "Cargo / Cátedra": g["cargo"],
                        "Artículo / Motivo": g["reason"],
                        "Desde": g["date_from"],
                        "Hasta": g["date_to"],
                        "Total Días": int(g["total_days"]),
                        "Diagnóstico / Observaciones": g["observations"],
                        "N° Disposición": disp_str,
                        "Hs Cátedra": int(g.get("hours", 4)),
                        "Código": "114A"
                    })

                for g in grouped_02:
                    disp_str = f"Disp. N° {disposicion_counter:03d}/{report_year}"
                    disposicion_counter += 1

                    rows_dl02.append({
                        "Oficina": office_code,
                        "Año": report_year,
                        "Mes": month,
                        "DNI": str(g["dni"]),
                        "Apellido y Nombres": g["full_name"],
                        "Situación de Revista": g["revista"],
                        "Cargo / Cátedra": g["cargo"],
                        "Tipo Novedad / Motivo": g["reason"],
                        "Desde": g["date_from"],
                        "Hasta": g["date_to"],
                        "Total Días": int(g["total_days"]),
                        "Observaciones / Justificación": g["observations"],
                        "N° Disposición": disp_str,
                        "Hs Cátedra": int(g.get("hours", 4)),
                        "Código": "115" if "permiso" in str(g["reason"]).lower() else "I"
                    })

            cols_dl01 = [
                "Oficina", "Año", "Mes", "DNI", "Apellido y Nombres",
                "Situación de Revista", "Cargo / Cátedra", "Artículo / Motivo",
                "Desde", "Hasta", "Total Días", "Diagnóstico / Observaciones",
                "N° Disposición", "Hs Cátedra", "Código"
            ]
            cols_dl02 = [
                "Oficina", "Año", "Mes", "DNI", "Apellido y Nombres",
                "Situación de Revista", "Cargo / Cátedra", "Tipo Novedad / Motivo",
                "Desde", "Hasta", "Total Días", "Observaciones / Justificación",
                "N° Disposición", "Hs Cátedra", "Código"
            ]

            df_dl01 = pd.DataFrame(rows_dl01, columns=cols_dl01)
            df_dl02 = pd.DataFrame(rows_dl02, columns=cols_dl02)

            if not df_dl01.empty:
                df_dl01["DNI"] = df_dl01["DNI"].astype(str)
                df_dl01["Total Días"] = df_dl01["Total Días"].astype(int)
            else:
                df_dl01 = pd.DataFrame(columns=cols_dl01)

            if not df_dl02.empty:
                df_dl02["DNI"] = df_dl02["DNI"].astype(str)
                df_dl02["Total Días"] = df_dl02["Total Días"].astype(int)
            else:
                df_dl02 = pd.DataFrame(columns=cols_dl02)

            return df_dl01, df_dl02

        finally:
            if close_session_at_end:
                session.close()

    @classmethod
    def process_monthly_records(
        cls,
        month: int,
        year: Optional[int] = None,
        career_id: Optional[int] = None,
        session: Optional[Session] = None
    ) -> dict:
        df_01, df_02 = cls.process_monthly_attendance(month=month, year=year, career_id=career_id, session=session)
        return {
            "il01": df_01.to_dict(orient="records"),
            "il02": df_02.to_dict(orient="records"),
            "dl01": df_01.to_dict(orient="records"),
            "dl02": df_02.to_dict(orient="records"),
            "df_il01": df_01,
            "df_il02": df_02,
            "df_dl01": df_01,
            "df_dl02": df_02,
            "stats": {
                "total_il01": len(df_01),
                "total_il02": len(df_02)
            }
        }
