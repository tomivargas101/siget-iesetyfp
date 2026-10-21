import os
import bcrypt
from datetime import datetime, date, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from database.config import load_config
from database.schema import (
    Base, User, Career, Subject, Teacher, Student, Designation, Substitution, Attendance, AuditLog
)

_engine = None
_SessionFactory = None

def get_connection_url(cfg: dict = None) -> str:
    if cfg is None:
        cfg = load_config()

    db_type = cfg.get("db_type", "sqlite").lower()

    if db_type == "sqlite":
        db_path = cfg.get("sqlite_path", "siget.db")
        return f"sqlite:///{db_path}"
    elif db_type == "mysql":
        user = cfg.get("user", "root")
        password = cfg.get("password", "")
        host = cfg.get("host", "localhost")
        port = cfg.get("port", 3306)
        db_name = cfg.get("database", "siget_db")
        return f"mysql+pymysql://{user}:{password}@{host}:{port}/{db_name}?charset=utf8mb4"
    elif db_type == "postgresql":
        user = cfg.get("user", "postgres")
        password = cfg.get("password", "")
        host = cfg.get("host", "localhost")
        port = cfg.get("port", 5432)
        db_name = cfg.get("database", "siget_db")
        return f"postgresql://{user}:{password}@{host}:{port}/{db_name}"
    else:
        return "sqlite:///siget.db"

def get_engine(cfg: dict = None, force_reconnect: bool = False):
    global _engine
    if _engine is None or force_reconnect:
        url = get_connection_url(cfg)
        connect_args = {}
        if url.startswith("sqlite"):
            connect_args = {"check_same_thread": False}
        _engine = create_engine(url, connect_args=connect_args, echo=False)
    return _engine

def get_db_session():
    global _SessionFactory
    if _SessionFactory is None:
        engine = get_engine()
        _SessionFactory = scoped_session(sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=engine))
    return _SessionFactory()

def hash_password(plain_password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")

def check_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def init_db(cfg: dict = None):
    """
    Inicializa las tablas y carga datos de demostración si la base está vacía.
    """
    engine = get_engine(cfg, force_reconnect=True)
    Base.metadata.create_all(bind=engine)

    session = get_db_session()
    try:
        # 1. Crear usuarios por defecto si no existen
        if session.query(User).count() == 0:
            rector_user = User(
                username="rector",
                password_hash=hash_password("rector123"),
                full_name="Lic. Roberto Valenzuela (Rector)",
                role="RECTOR",
                email="rectoria@siget-edu.ar",
                is_active=True
            )
            bedel_user = User(
                username="bedel",
                password_hash=hash_password("bedel123"),
                full_name="María Eugenia Giménez (Bedel)",
                role="BEDEL",
                email="bedelia@siget-edu.ar",
                is_active=True
            )
            admin_user = User(
                username="admin",
                password_hash=hash_password("admin123"),
                full_name="Secretaría Académica",
                role="RECTOR",
                email="secretaria@siget-edu.ar",
                is_active=True
            )
            session.add_all([rector_user, bedel_user, admin_user])
            session.commit()

        # 2. Cargar carreras de ejemplo
        if session.query(Career).count() == 0:
            c1 = Career(
                code="TEC-DS",
                name="Tecnicatura Superior en Desarrollo de Software",
                resolution_number="Res. Min. 1420/21",
                duration_years=3
            )
            c2 = Career(
                code="TEC-EA",
                name="Tecnicatura Superior en Enfermería y Asistencia",
                resolution_number="Res. Min. 850/19",
                duration_years=3
            )
            session.add_all([c1, c2])
            session.commit()

            # Materias
            sub1 = Subject(career_id=c1.id, code="DS-101", name="Algoritmos y Estructuras de Datos I", year_level=1, weekly_hours=5)
            sub2 = Subject(career_id=c1.id, code="DS-102", name="Sistemas y Organizaciones", year_level=1, weekly_hours=4)
            sub3 = Subject(career_id=c1.id, code="DS-201", name="Bases de Datos Relacionales", year_level=2, weekly_hours=4)
            sub4 = Subject(career_id=c1.id, code="DS-202", name="Programación Orientada a Objetos", year_level=2, weekly_hours=5)
            sub5 = Subject(career_id=c2.id, code="ENF-101", name="Anatomofisiología", year_level=1, weekly_hours=6)
            session.add_all([sub1, sub2, sub3, sub4, sub5])
            session.commit()

        # 3. Cargar docentes de ejemplo
        if session.query(Teacher).count() == 0:
            t1 = Teacher(
                legajo="DOC-00101",
                dni="28456123",
                cuil="20-28456123-4",
                first_name="Carlos Alberto",
                last_name="Fernández",
                email="carlos.fernandez@siget-edu.ar",
                phone="11-4567-8901",
                revista="Titular",
                max_weekly_hours=30
            )
            t2 = Teacher(
                legajo="DOC-00102",
                dni="30987654",
                cuil="27-30987654-2",
                first_name="Silvina Beatriz",
                last_name="Morales",
                email="silvina.morales@siget-edu.ar",
                phone="11-5678-1234",
                revista="Provisional",
                max_weekly_hours=30
            )
            t3 = Teacher(
                legajo="DOC-00103",
                dni="32456789",
                cuil="20-32456789-8",
                first_name="Lucas Matías",
                last_name="Gutiérrez",
                email="lucas.gutierrez@siget-edu.ar",
                phone="11-6789-4321",
                revista="Suplente",
                max_weekly_hours=30
            )
            t4 = Teacher(
                legajo="DOC-00104",
                dni="25123987",
                cuil="23-25123987-9",
                first_name="Elena Patricia",
                last_name="Rodríguez",
                email="elena.rodriguez@siget-edu.ar",
                phone="11-3456-7890",
                revista="Interino",
                max_weekly_hours=30
            )
            session.add_all([t1, t2, t3, t4])
            session.commit()

            # Designaciones iniciales
            sub_db = session.query(Subject).filter_by(code="DS-101").first()
            if sub_db:
                desig1 = Designation(
                    subject_id=sub_db.id,
                    teacher_id=t1.id,
                    day_of_week="Lunes",
                    start_time="18:30",
                    end_time="21:30",
                    hours_count=5,
                    resolution_number="RES-DIR-045/2026",
                    academic_year=datetime.now().year,
                    notes="Cátedra titular de primer año"
                )
                session.add(desig1)
                session.commit()

                # Ejemplo de Suplencia registrada
                subst1 = Substitution(
                    designation_id=desig1.id,
                    titular_teacher_id=t1.id,
                    suplente_teacher_id=t3.id,
                    license_reason="Licencia por Tratamiento Médico Prolongado (Art. 48)",
                    start_date=date.today() - timedelta(days=15),
                    end_date=date.today() + timedelta(days=45),
                    resolution_number="RES-MIN-998/26",
                    is_active=True
                )
                session.add(subst1)
                session.commit()

        # 4. Cargar alumnos de ejemplo
        if session.query(Student).count() == 0:
            c1 = session.query(Career).first()
            st1 = Student(
                legajo="ALU-2026-001",
                dni="44123456",
                cuil="20-44123456-3",
                first_name="Martín Ignacio",
                last_name="Pereyra",
                email="m.pereyra@estudiante.edu.ar",
                phone="11-2345-6789",
                career_id=c1.id if c1 else None,
                year_enrolled=2026
            )
            st2 = Student(
                legajo="ALU-2026-002",
                dni="45876543",
                cuil="27-45876543-8",
                first_name="Camila Belén",
                last_name="Alvarez",
                email="c.alvarez@estudiante.edu.ar",
                phone="11-9876-5432",
                career_id=c1.id if c1 else None,
                year_enrolled=2026
            )
            session.add_all([st1, st2])
            session.commit()

    finally:
        session.close()
