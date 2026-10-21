from database.connection import get_db_session
from database.schema import Student, Career
from models.auth import AuthService

class StudentService:
    @staticmethod
    def get_all(search_term: str = "", career_id: int = None):
        session = get_db_session()
        try:
            query = session.query(Student)
            if career_id and career_id != 0:
                query = query.filter(Student.career_id == career_id)

            if search_term:
                term = f"%{search_term.strip()}%"
                query = query.filter(
                    (Student.last_name.ilike(term)) |
                    (Student.first_name.ilike(term)) |
                    (Student.dni.ilike(term)) |
                    (Student.legajo.ilike(term))
                )
            students = query.order_by(Student.last_name, Student.first_name).all()

            results = []
            for s in students:
                results.append({
                    "id": s.id,
                    "legajo": s.legajo,
                    "dni": s.dni,
                    "cuil": s.cuil or "-",
                    "full_name": s.full_name,
                    "first_name": s.first_name,
                    "last_name": s.last_name,
                    "email": s.email or "-",
                    "phone": s.phone or "-",
                    "career_name": s.career.name if s.career else "Sin Carrera",
                    "career_id": s.career_id,
                    "year_enrolled": s.year_enrolled,
                    "is_active": s.is_active
                })
            return results
        finally:
            session.close()

    @staticmethod
    def save(data: dict) -> tuple[bool, str]:
        session = get_db_session()
        try:
            s_id = data.get("id")

            # Validar DNI y Legajo
            dni_check = session.query(Student).filter(Student.dni == data["dni"])
            if s_id:
                dni_check = dni_check.filter(Student.id != s_id)
            if dni_check.first():
                return False, f"Ya existe un alumno con el DNI {data['dni']}."

            leg_check = session.query(Student).filter(Student.legajo == data["legajo"])
            if s_id:
                leg_check = leg_check.filter(Student.id != s_id)
            if leg_check.first():
                return False, f"Ya existe un alumno con el Legajo {data['legajo']}."

            career_id = data.get("career_id")
            if career_id == 0 or career_id == "0":
                career_id = None

            if s_id:
                student = session.query(Student).filter(Student.id == s_id).first()
                if not student:
                    return False, "Alumno no encontrado."
                student.legajo = data["legajo"]
                student.dni = data["dni"]
                student.cuil = data.get("cuil")
                student.first_name = data["first_name"]
                student.last_name = data["last_name"]
                student.email = data.get("email")
                student.phone = data.get("phone")
                student.career_id = career_id
                student.year_enrolled = int(data.get("year_enrolled", 2026))
                student.is_active = data.get("is_active", True)
                action = "ACTUALIZAR_ALUMNO"
            else:
                student = Student(
                    legajo=data["legajo"],
                    dni=data["dni"],
                    cuil=data.get("cuil"),
                    first_name=data["first_name"],
                    last_name=data["last_name"],
                    email=data.get("email"),
                    phone=data.get("phone"),
                    career_id=career_id,
                    year_enrolled=int(data.get("year_enrolled", 2026)),
                    is_active=data.get("is_active", True)
                )
                session.add(student)
                action = "CREAR_ALUMNO"

            session.commit()
            AuthService.log_action(action, f"Alumno {student.legajo} - {student.full_name}")
            return True, "Alumno guardado correctamente."
        except Exception as e:
            session.rollback()
            return False, f"Error al guardar alumno: {str(e)}"
        finally:
            session.close()

    @staticmethod
    def toggle_active(student_id: int) -> tuple[bool, str]:
        session = get_db_session()
        try:
            s = session.query(Student).filter(Student.id == student_id).first()
            if not s:
                return False, "Alumno no encontrado."
            s.is_active = not s.is_active
            session.commit()
            status_text = "activado" if s.is_active else "desactivado"
            AuthService.log_action("CAMBIO_ESTADO_ALUMNO", f"Alumno {s.legajo} {status_text}")
            return True, f"Alumno {status_text} correctamente."
        except Exception as e:
            session.rollback()
            return False, str(e)
        finally:
            session.close()
