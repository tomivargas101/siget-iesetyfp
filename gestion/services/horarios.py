from datetime import date, time
from django.core.exceptions import ValidationError
from ..models import Designacion, HorarioDesignacion, Suplencia, Agente, Materia

DIAS_SEMANA_ORDEN = {
    0: "Lunes",
    1: "Martes",
    2: "Miércoles",
    3: "Jueves",
    4: "Viernes",
    5: "Sábado",
    6: "Domingo"
}

class HorarioService:
    """
    Servicio de dominio para el cálculo de franjas horarias, validación de topes semanales,
    control de superposiciones y gestión institucional de suplencias.
    """

    @classmethod
    def obtener_franjas_docente_en_fecha(cls, agente: Agente, fecha: date) -> list[dict]:
        """
        Obtiene exclusivamente las franjas y horas cátedra correspondientes al día de la semana
        (fecha.weekday()) y vigencia de la designación en la fecha afectada.
        """
        nombre_dia = DIAS_SEMANA_ORDEN.get(fecha.weekday(), "")
        desigs_activas = agente.designaciones.filter(activo=True).select_related("materia", "materia__carrera")
        
        franjas_encontradas = []
        for desig in desigs_activas:
            if not desig.esta_vigente_en(fecha):
                continue
            
            # Buscar en el modelo 1:N HorarioDesignacion
            horarios = desig.horarios.filter(activo=True, dia_semana__iexact=nombre_dia)
            if horarios.exists():
                for h in horarios:
                    franjas_encontradas.append({
                        "designacion": desig,
                        "horario": h,
                        "dia_semana": h.dia_semana,
                        "hora_inicio": h.hora_inicio,
                        "hora_fin": h.hora_fin,
                        "horas_catedra": h.horas_catedra,
                        "materia": desig.materia,
                    })
            elif desig.dia_semana and desig.dia_semana.lower() == nombre_dia.lower():
                # Fallback retrocompatible
                franjas_encontradas.append({
                    "designacion": desig,
                    "horario": None,
                    "dia_semana": desig.dia_semana,
                    "hora_inicio": desig.hora_inicio,
                    "hora_fin": desig.hora_fin,
                    "horas_catedra": desig.horas_catedra or 0,
                    "materia": desig.materia,
                })
        return franjas_encontradas

    @classmethod
    def calcular_horas_docente_en_fecha(cls, agente: Agente, fecha: date) -> int:
        """Suma de horas cátedra que el docente debe dictar en una fecha calendario específica."""
        franjas = cls.obtener_franjas_docente_en_fecha(agente, fecha)
        return sum(f["horas_catedra"] for f in franjas)

    @classmethod
    def calcular_horas_semanales(cls, agente: Agente, excluir_designacion_id=None) -> int:
        """Cálculo consolidado de horas cátedra semanales activas para un docente."""
        qs = agente.designaciones.filter(activo=True)
        if excluir_designacion_id:
            qs = qs.exclude(id=excluir_designacion_id)
        total = 0
        for d in qs:
            horarios = d.horarios.filter(activo=True)
            if horarios.exists():
                total += sum(h.horas_catedra for h in horarios)
            else:
                total += d.horas_catedra or 0
        return total

    @classmethod
    def validar_tope_semanal(cls, agente: Agente, nuevas_horas: int = 0, excluir_designacion_id=None) -> tuple[bool, str]:
        """Valida que la suma de horas cátedra semanales activas no supere el tope de 30 hs (o el límite del agente)."""
        horas_actuales = cls.calcular_horas_semanales(agente, excluir_designacion_id=excluir_designacion_id)
        total = horas_actuales + nuevas_horas
        max_permitido = agente.max_horas_semanales
        if total > max_permitido:
            return False, f"El agente posee actualmente {horas_actuales} hs activas. Sumar {nuevas_horas} hs excedería el tope legal de {max_permitido} hs semanales (Total: {total} hs)."
        return True, f"Horas válidas ({total}/{max_permitido} hs)."

    @classmethod
    def hay_superposicion_intervalos(cls, hi1, hf1, hi2, hf2) -> bool:
        """
        Determina si dos intervalos de tiempo se superponen.
        Las franjas se superponen si max(hi1, hi2) < min(hf1, hf2).
        Si hf1 == hi2, no hay superposición (clases consecutivas continuas).
        """
        def a_minutos(val):
            if isinstance(val, time):
                return val.hour * 60 + val.minute
            if isinstance(val, str):
                partes = str(val).strip().split(":")
                return int(partes[0]) * 60 + int(partes[1])
            return 0
        
        m_hi1 = a_minutos(hi1)
        m_hf1 = a_minutos(hf1)
        m_hi2 = a_minutos(hi2)
        m_hf2 = a_minutos(hf2)
        return max(m_hi1, m_hi2) < min(m_hf1, m_hf2)

    @classmethod
    def validar_superposicion_franjas(cls, horarios_data: list, docente: Agente = None, excluir_designacion_id=None) -> tuple[bool, str]:
        """
        1. Valida que no haya superposición interna entre las franjas provistas para la designación.
        2. Si se provee docente, valida contra todas las otras designaciones activas del docente.
        """
        # 1. Superposición interna
        n = len(horarios_data)
        for i in range(n):
            h1 = horarios_data[i]
            dia1 = h1.get("dia_semana")
            hi1 = h1.get("hora_inicio")
            hf1 = h1.get("hora_fin")
            if not (dia1 and hi1 and hf1):
                continue
            for j in range(i + 1, n):
                h2 = horarios_data[j]
                dia2 = h2.get("dia_semana")
                hi2 = h2.get("hora_inicio")
                hf2 = h2.get("hora_fin")
                if dia1.lower() == dia2.lower() and cls.hay_superposicion_intervalos(hi1, hf1, hi2, hf2):
                    return False, f"Conflicto de horario: Superposición interna en el día {dia1} entre {hi1}-{hf1} y {hi2}-{hf2}."

        # 2. Superposición externa con otras cátedras del mismo docente
        if docente:
            otras_desigs = docente.designaciones.filter(activo=True)
            if excluir_designacion_id:
                otras_desigs = otras_desigs.exclude(id=excluir_designacion_id)
            
            for d in otras_desigs:
                for h_otro in d.horarios.filter(activo=True):
                    for h_nuevo in horarios_data:
                        dia_nuevo = h_nuevo.get("dia_semana")
                        hi_nuevo = h_nuevo.get("hora_inicio")
                        hf_nuevo = h_nuevo.get("hora_fin")
                        if dia_nuevo and dia_nuevo.lower() == h_otro.dia_semana.lower():
                            if cls.hay_superposicion_intervalos(hi_nuevo, hf_nuevo, h_otro.hora_inicio, h_otro.hora_fin):
                                return False, (
                                    f"Conflicto de horarios del docente: En el día {dia_nuevo}, la franja {hi_nuevo}-{hf_nuevo} "
                                    f"se superpone con su otra cátedra activa '{d.materia.nombre}' ({h_otro.hora_inicio}-{h_otro.hora_fin})."
                                )
        return True, "Horarios sin conflictos de superposición."

    @classmethod
    def validar_suplencia(cls, designacion_suplente: Designacion, designacion_cubierta: Designacion = None, motivo: str = "LICENCIA", fecha_desde=None, fecha_hasta=None) -> tuple[bool, str]:
        """
        Valida las reglas institucionales para registrar o activar una suplencia.
        """
        if designacion_suplente.situacion_revista != "SUP":
            return False, "La designación del suplente debe tener situación de revista 'SUP'."

        if motivo == "VACANTE":
            if designacion_cubierta and designacion_cubierta.materia_id != designacion_suplente.materia_id:
                return False, "La designación cubierta y suplente deben ser de la misma materia."
        else:
            if not designacion_cubierta:
                return False, "Debe especificar la designación titular o interina cubierta para el motivo seleccionado."
            
            # Anti auto-suplencia
            if designacion_cubierta.id == designacion_suplente.id:
                return False, "Una designación no puede suplirse a sí misma."
            if designacion_cubierta.agente_id == designacion_suplente.agente_id:
                return False, f"Incompatibilidad institucional: El docente {designacion_suplente.agente.nombre_completo} no puede auto-suplirse en su propia cátedra."

            # Coincidencia de materia y carrera
            if designacion_cubierta.materia_id != designacion_suplente.materia_id:
                return False, f"La cátedra cubierta ({designacion_cubierta.materia.nombre}) no coincide con la cátedra suplente ({designacion_suplente.materia.nombre})."

            # Revista de la cubierta: TIT o INT
            if designacion_cubierta.situacion_revista not in ["TIT", "INT"]:
                return False, f"La designación cubierta debe ser Titular (TIT) o Interina (INT), pero es {designacion_cubierta.situacion_revista}."

        # Coherencia de fechas
        if fecha_desde and fecha_hasta and fecha_hasta < fecha_desde:
            return False, "La fecha 'Hasta' de la suplencia no puede ser anterior a la fecha 'Desde'."

        return True, "Suplencia válida."

    @classmethod
    def desactivar_suplencias_si_no_es_suplente(cls, designacion: Designacion):
        """Si la designación deja de ser SUP, desactiva sus suplencias activas como histórico."""
        if designacion.situacion_revista != "SUP":
            designacion.suplencias_como_suplente.filter(activo=True).update(activo=False)
