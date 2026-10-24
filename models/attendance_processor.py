"""
Módulo de Procesamiento Automatizado de Asistencia y Cuadros Mensuales (DL-01 y DL-02).

Implementa la lógica central con Pandas para el procesamiento mensual de novedades:
- RN-01: DNI como texto unívoco y datos comunes almacenados una sola vez.
- RN-02: Manejo de múltiples designaciones con situación de revista (TIT, INT, SUP).
- RN-03: Conservación del historial completo ante bajas lógicas.
- RN-04: Cuadro DL-01 - Exclusivo para licencias por enfermedad.
- RN-05: Cuadro DL-02 - Para inasistencias, permisos y otras licencias no médicas.
- RN-06: Una inasistencia solo puede abarcar un día (Desde == Hasta, Total Días == 1).
- RN-07: Autocompletado normativo de columna "Oficina" con valor 1452.
- RN-08: Autocompletado normativo de columna "Año" con el año calendario actual.
- Agrupación automática de días consecutivos para licencias continuas en formato texto 'DD/MM/YYYY'.
"""

from datetime import datetime, date, timedelta
from typing import Optional, Union
import pandas as pd
from sqlalchemy.orm import Session

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
    """
    Procesador de asistencias diarias y generador de los cuadros normativos DL-01 y DL-02.
    """

    @staticmethod
    def _is_consecutive(d1: date, d2: date, bridge_weekends: bool = True) -> bool:
        """
        Determina de forma inteligente si dos fechas son consecutivas:
        - Si la diferencia es de 1 día calendario (d2 == d1 + 1 día).
        - Si bridge_weekends es True: si d1 es Viernes (weekday 4) y d2 es Lunes (weekday 0),
          o si d1 es Sábado (weekday 5) y d2 es Lunes, considera el fin de semana continuo.
        """
        diff = (d2 - d1).days
        if diff == 1:
            return True
        if bridge_weekends and diff <= 3:
            # d1 es viernes (4) y d2 es lunes (0)
            if d1.weekday() == 4 and d2.weekday() == 0:
                return True
            # d1 es sábado (5) y d2 es lunes (0)
            if d1.weekday() == 5 and d2.weekday() == 0:
                return True
        return False

    @staticmethod
    def group_consecutive_days(records: list[dict], bridge_weekends: bool = True) -> list[dict]:
        """
        Agrupa inteligentemente las marcas continuas de licencia de un docente en rangos consolidados:
        - Si es una inasistencia (RN-06): NUNCA se agrupa, cada día genera un registro único de 1 día.
        - Si es una licencia continua (médica o no médica): agrupa los días consecutivos calculando
          las fechas 'Desde' y 'Hasta' (en formato texto 'DD/MM/YYYY') y el cómputo de 'Total Días'.
        """
        if not records:
            return []

        # Ordenar por fecha cronológica ascendente
        sorted_records = sorted(records, key=lambda r: r["date"])

        grouped: list[dict] = []
        current_block: list[dict] = []

        for rec in sorted_records:
            # Regla Crítica RN-06: Una inasistencia solo puede abarcar un día
            if rec.get("is_absence", False):
                # Si había un bloque de licencias en curso, cerrarlo primero
                if current_block:
                    grouped.append(AttendanceProcessor._consolidate_block(current_block))
                    current_block = []

                # La inasistencia se vuelca de forma individual (1 solo día)
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

            # Para licencias (DL-01 o DL-02 no inasistencias):
            if not current_block:
                current_block.append(rec)
            else:
                last_rec = current_block[-1]
                # Comprobar si son del mismo motivo/tabla y consecutivas
                same_reason = (last_rec.get("reason") == rec.get("reason") and
                               last_rec.get("target_table") == rec.get("target_table"))
                consecutive = AttendanceProcessor._is_consecutive(last_rec["date"], rec["date"], bridge_weekends)

                if same_reason and consecutive:
                    current_block.append(rec)
                else:
                    # Cerrar bloque anterior y comenzar nuevo
                    grouped.append(AttendanceProcessor._consolidate_block(current_block))
                    current_block = [rec]

        if current_block:
            grouped.append(AttendanceProcessor._consolidate_block(current_block))

        return grouped

    @staticmethod
    def _consolidate_block(block: list[dict]) -> dict:
        """
        Consolida una secuencia de días continuos de licencia en un único registro con
        fechas 'Desde' y 'Hasta' en formato texto 'DD/MM/YYYY'.
        """
        first = block[0]
        last = block[-1]

        start_d: date = first["date"]
        end_d: date = last["date"]
        # Total de días cubiertos por el período continuo
        total_days = (end_d - start_d).days + 1

        # Consolidar observaciones únicas
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
        """
        Procesa la asistencia diaria del mes calendario y devuelve dos DataFrames de Pandas:
        - df_dl01: Cuadro DL-01 (Exclusivo Licencias por Enfermedad - RN-04).
        - df_dl02: Cuadro DL-02 (Inasistencias, Permisos y Licencias no médicas - RN-05).

        Aplica estrictamente:
        - RN-01: DNI como texto.
        - RN-02: Situación de revista normalizada (TIT, INT, SUP).
        - RN-03: Conservación de antecedentes históricos ante bajas lógicas.
        - RN-06: Inasistencias de 1 día exacto.
        - RN-07: Oficina autocompletada con 1452.
        - RN-08: Año autocompletado con el año calendario actual.
        """
        close_session_at_end = False
        if session is None:
            session = get_db_session()
            close_session_at_end = True

        current_year = NormativeClassifier.get_current_academic_year()
        report_year = int(year) if year else current_year
        office_code = NormativeClassifier.get_default_office()  # RN-07: 1452

        try:
            # 1. Definir rango del mes
            first_day = date(report_year, month, 1)
            if month == 12:
                last_day = date(report_year, 12, 31)
            else:
                last_day = date(report_year, month + 1, 1) - timedelta(days=1)

            # 2. Consultar asistencias del período
            att_query = session.query(Attendance).join(Teacher).filter(
                Attendance.date >= first_day,
                Attendance.date <= last_day,
                Attendance.is_active == True  # RN-03: considerar activas para el reporte
            )

            # Si hay filtro de carrera, vincular con docentes de cátedras de esa carrera
            if career_id and career_id != 0:
                att_query = att_query.join(
                    Designation, Designation.teacher_id == Teacher.id
                ).join(
                    Subject, Subject.id == Designation.subject_id
                ).filter(
                    Subject.career_id == career_id
                )

            attendances = att_query.order_by(Teacher.last_name, Teacher.first_name, Attendance.date).all()

            # Estructurar registros filtrando únicamente no-presencias
            raw_records_by_teacher: dict[int, list[dict]] = {}

            for att in attendances:
                st = att.status or ""
                obs = att.observations or ""
                t = att.teacher

                target_table = NormativeClassifier.classify_target_table(st, obs)
                if target_table in ("PRESENTE", "IGNORAR"):
                    continue

                # Determinar si es inasistencia (RN-06)
                is_abs = NormativeClassifier.is_absence(st, obs)

                # Obtener designación o cargo representativo
                desig = att.designation
                if not desig and t.designations:
                    # Usar la primera designación activa o la principal
                    active_desigs = [d for d in t.designations if d.is_active]
                    desig = active_desigs[0] if active_desigs else t.designations[0]

                cargo_desc = desig.effective_cargo if desig else "Docente de Planta"
                revista_code = desig.effective_revista if desig else NormativeClassifier.normalize_revista(t.revista)

                # Determinar motivo formal
                reason_desc = obs if obs else st
                if target_table == "DL-01":
                    # Si no especifica artículo médico en obs, normalizar con Art. 48 o Enfermedad
                    if not any(k in obs.lower() for k in ("art", "enferm", "salud")):
                        reason_desc = MEDICAL_ARTICLES["ART_48"] if not obs else f"Art. 48 Salud ({obs})"

                record_item = {
                    "teacher_id": t.id,
                    "dni": NormativeClassifier.normalize_dni(t.dni),  # RN-01: Texto
                    "full_name": t.full_name,
                    "revista": revista_code,  # RN-02: TIT, INT, SUP
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

            # 3. También incorporar suplencias/licencias formales activas de la tabla substitutions
            # para no omitir licencias de largo tratamiento autorizadas por resolución
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
                # Si el titular no tiene ya marcas de asistencia que cubran este período
                # calculamos el rango efectivo dentro de este mes
                eff_start = max(sub.start_date, first_day)
                eff_end = min(sub.end_date, last_day)

                # Si ya tiene registros diarios procesados para estos días, evitamos duplicar
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

            # 4. Procesar y agrupar días consecutivos por docente
            rows_dl01: list[dict] = []
            rows_dl02: list[dict] = []

            for tid, t_records in raw_records_by_teacher.items():
                # Separar los registros del docente por tabla de destino
                recs_dl01 = [r for r in t_records if r["target_table"] == "DL-01"]
                recs_dl02 = [r for r in t_records if r["target_table"] == "DL-02"]

                # Agrupación inteligente de días consecutivos
                grouped_01 = cls.group_consecutive_days(recs_dl01, bridge_weekends=True)
                grouped_02 = cls.group_consecutive_days(recs_dl02, bridge_weekends=True)

                # Construir filas para DL-01 (RN-04)
                for g in grouped_01:
                    rows_dl01.append({
                        "Oficina": office_code,  # RN-07: 1452
                        "Año": report_year,      # RN-08: Año actual
                        "Mes": month,
                        "DNI": str(g["dni"]),    # RN-01: Texto unívoco
                        "Apellido y Nombres": g["full_name"],
                        "Situación de Revista": g["revista"],  # RN-02: TIT, INT, SUP
                        "Cargo / Cátedra": g["cargo"],
                        "Artículo / Motivo": g["reason"],
                        "Desde": g["date_from"],  # Formato texto 'DD/MM/YYYY'
                        "Hasta": g["date_to"],    # Formato texto 'DD/MM/YYYY'
                        "Total Días": int(g["total_days"]),
                        "Diagnóstico / Observaciones": g["observations"]
                    })

                # Construir filas para DL-02 (RN-05 & RN-06)
                for g in grouped_02:
                    rows_dl02.append({
                        "Oficina": office_code,  # RN-07: 1452
                        "Año": report_year,      # RN-08: Año actual
                        "Mes": month,
                        "DNI": str(g["dni"]),    # RN-01: Texto unívoco
                        "Apellido y Nombres": g["full_name"],
                        "Situación de Revista": g["revista"],  # RN-02: TIT, INT, SUP
                        "Cargo / Cátedra": g["cargo"],
                        "Tipo Novedad / Motivo": g["reason"],
                        "Desde": g["date_from"],  # Formato texto 'DD/MM/YYYY'
                        "Hasta": g["date_to"],    # Formato texto 'DD/MM/YYYY' (igual a Desde si inasistencia)
                        "Total Días": int(g["total_days"]),
                        "Observaciones / Justificación": g["observations"]
                    })

            # 5. Generar DataFrames con Pandas garantizando dtypes y estructura
            cols_dl01 = [
                "Oficina", "Año", "Mes", "DNI", "Apellido y Nombres",
                "Situación de Revista", "Cargo / Cátedra", "Artículo / Motivo",
                "Desde", "Hasta", "Total Días", "Diagnóstico / Observaciones"
            ]
            cols_dl02 = [
                "Oficina", "Año", "Mes", "DNI", "Apellido y Nombres",
                "Situación de Revista", "Cargo / Cátedra", "Tipo Novedad / Motivo",
                "Desde", "Hasta", "Total Días", "Observaciones / Justificación"
            ]

            df_dl01 = pd.DataFrame(rows_dl01, columns=cols_dl01)
            df_dl02 = pd.DataFrame(rows_dl02, columns=cols_dl02)

            # Asegurar tipo string para DNI para evitar pérdida de ceros a la izquierda
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
