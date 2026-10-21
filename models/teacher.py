from database.connection import get_db_session
from database.schema import Teacher, Designation
from models.auth import AuthService

REVISTAS = ["Titular", "Provisional", "Interino", "Suplente"]

class TeacherService:
    @staticmethod
    def get_all(search_term: str = "", revista_filter: str = "Todos"):
        session = get_db_session()
        try:
            query = session.query(Teacher)
            if revista_filter and revista_filter != "Todos":
                query = query.filter(Teacher.revista == revista_filter)
            
            if search_term:
                term = f"%{search_term.strip()}%"
                query = query.filter(
                    (Teacher.last_name.ilike(term)) |
                    (Teacher.first_name.ilike(term)) |
                    (Teacher.dni.ilike(term)) |
                    (Teacher.legajo.ilike(term))
                )
            teachers = query.order_by(Teacher.last_name, Teacher.first_name).all()
            
            # Map with active hours
            results = []
            for t in teachers:
                active_hours = sum(d.hours_count for d in t.designations if d.is_active)
                results.append({
                    "id": t.id,
                    "legajo": t.legajo,
                    "dni": t.dni,
                    "cuil": t.cuil or "-",
                    "full_name": t.full_name,
                    "first_name": t.first_name,
                    "last_name": t.last_name,
                    "email": t.email or "-",
                    "phone": t.phone or "-",
                    "revista": t.revista,
                    "max_hours": t.max_weekly_hours,
                    "active_hours": active_hours,
                    "is_active": t.is_active
                })
            return results
        finally:
            session.close()

    @staticmethod
    def get_by_id(teacher_id: int):
        session = get_db_session()
        try:
            return session.query(Teacher).filter(Teacher.id == teacher_id).first()
        finally:
            session.close()

    @staticmethod
    def save(data: dict) -> tuple[bool, str]:
        session = get_db_session()
        try:
            t_id = data.get("id")
            
            # Validar unicidad DNI y Legajo
            dni_check = session.query(Teacher).filter(Teacher.dni == data["dni"])
            if t_id:
                dni_check = dni_check.filter(Teacher.id != t_id)
            if dni_check.first():
                return False, f"Ya existe un docente con el DNI {data['dni']}."

            legajo_check = session.query(Teacher).filter(Teacher.legajo == data["legajo"])
            if t_id:
                legajo_check = legajo_check.filter(Teacher.id != t_id)
            if legajo_check.first():
                return False, f"Ya existe un docente con el Legajo {data['legajo']}."

            if t_id:
                teacher = session.query(Teacher).filter(Teacher.id == t_id).first()
                if not teacher:
                    return False, "Docente no encontrado para actualizar."
                teacher.legajo = data["legajo"]
                teacher.dni = data["dni"]
                teacher.cuil = data.get("cuil")
                teacher.first_name = data["first_name"]
                teacher.last_name = data["last_name"]
                teacher.email = data.get("email")
                teacher.phone = data.get("phone")
                teacher.revista = data.get("revista", "Titular")
                teacher.max_weekly_hours = int(data.get("max_weekly_hours", 30))
                teacher.is_active = data.get("is_active", True)
                action = "ACTUALIZAR_DOCENTE"
            else:
                teacher = Teacher(
                    legajo=data["legajo"],
                    dni=data["dni"],
                    cuil=data.get("cuil"),
                    first_name=data["first_name"],
                    last_name=data["last_name"],
                    email=data.get("email"),
                    phone=data.get("phone"),
                    revista=data.get("revista", "Titular"),
                    max_weekly_hours=int(data.get("max_weekly_hours", 30)),
                    is_active=data.get("is_active", True)
                )
                session.add(teacher)
                action = "CREAR_DOCENTE"

            session.commit()
            AuthService.log_action(action, f"Docente {teacher.legajo} - {teacher.full_name}")
            return True, "Docente guardado correctamente."
        except Exception as e:
            session.rollback()
            return False, f"Error al guardar docente: {str(e)}"
        finally:
            session.close()

    @staticmethod
    def toggle_active(teacher_id: int) -> tuple[bool, str]:
        session = get_db_session()
        try:
            t = session.query(Teacher).filter(Teacher.id == teacher_id).first()
            if not t:
                return False, "Docente no encontrado."
            t.is_active = not t.is_active
            session.commit()
            status_text = "activado" if t.is_active else "desactivado"
            AuthService.log_action("CAMBIO_ESTADO_DOCENTE", f"Docente {t.legajo} {status_text}")
            return True, f"Docente {status_text} exitosamente."
        except Exception as e:
            session.rollback()
            return False, str(e)
        finally:
            session.close()
