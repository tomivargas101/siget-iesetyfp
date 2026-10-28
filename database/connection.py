import os
import bcrypt
from datetime import datetime, date, timedelta
from sqlalchemy import create_engine, event, inspect, text
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

def _setup_sqlite_pragmas(target_engine):
    """Configura PRAGMAs de alto rendimiento y concurrencia (WAL) para SQLite."""
    @event.listens_for(target_engine, "connect")
    def _set_pragmas(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode = WAL;")
            cursor.execute("PRAGMA synchronous = NORMAL;")
            cursor.execute("PRAGMA busy_timeout = 30000;")
            cursor.execute("PRAGMA foreign_keys = ON;")
            cursor.close()
        except Exception:
            pass

def get_engine(cfg: dict = None, force_reconnect: bool = False):
    global _engine, _SessionFactory
    if cfg is None:
        cfg = load_config()

    if _engine is None or force_reconnect:
        # Si se fuerza reconexión, limpiar pool anterior y scoped_session
        if _SessionFactory is not None:
            try:
                _SessionFactory.remove()
            except Exception:
                pass
            _SessionFactory = None

        if _engine is not None:
            try:
                _engine.dispose()
            except Exception:
                pass
            _engine = None

        url = get_connection_url(cfg)
        db_type = cfg.get("db_type", "sqlite").lower()
        timeout = int(cfg.get("connect_timeout", 5))

        if db_type == "sqlite":
            connect_args = {
                "check_same_thread": False,
                "timeout": int(cfg.get("sqlite_timeout", 30))
            }
            _engine = create_engine(
                url,
                connect_args=connect_args,
                pool_pre_ping=True,
                echo=False
            )
            _setup_sqlite_pragmas(_engine)
        elif db_type == "mysql":
            connect_args = {
                "connect_timeout": timeout,
                "read_timeout": timeout * 2,
                "write_timeout": timeout * 2
            }
            _engine = create_engine(
                url,
                connect_args=connect_args,
                pool_size=int(cfg.get("pool_size", 10)),
                max_overflow=int(cfg.get("max_overflow", 20)),
                pool_recycle=int(cfg.get("pool_recycle", 1800)),
                pool_pre_ping=True,
                echo=False
            )
        elif db_type == "postgresql":
            connect_args = {
                "connect_timeout": timeout
            }
            _engine = create_engine(
                url,
                connect_args=connect_args,
                pool_size=int(cfg.get("pool_size", 10)),
                max_overflow=int(cfg.get("max_overflow", 20)),
                pool_recycle=int(cfg.get("pool_recycle", 1800)),
                pool_pre_ping=True,
                echo=False
            )
        else:
            _engine = create_engine(url, echo=False)

    return _engine

def get_db_session():
    global _SessionFactory
    if _SessionFactory is None:
        engine = get_engine()
        _SessionFactory = scoped_session(
            sessionmaker(
                autocommit=False,
                autoflush=False,
                expire_on_commit=False,
                bind=engine
            )
        )
    return _SessionFactory()

def test_connection(cfg: dict = None) -> tuple[bool, str]:
    """
    Verifica la conectividad con el servidor de base de datos sin alterar el estado global.
    Retorna (True, 'Conexión exitosa') o (False, mensaje_error_amigable).
    """
    if cfg is None:
        cfg = load_config()

    db_type = cfg.get("db_type", "sqlite").lower()
    url = get_connection_url(cfg)
    timeout = int(cfg.get("connect_timeout", 4))

    try:
        connect_args = {}
        if db_type == "sqlite":
            connect_args = {"check_same_thread": False, "timeout": 5}
        elif db_type == "mysql":
            connect_args = {"connect_timeout": timeout}
        elif db_type == "postgresql":
            connect_args = {"connect_timeout": timeout}

        temp_engine = create_engine(url, connect_args=connect_args, pool_pre_ping=False)
        with temp_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        temp_engine.dispose()
        return True, "Conexión establecida correctamente con el servidor."
    except Exception as e:
        err_str = str(e)
        host = cfg.get("host", "localhost")
        port = cfg.get("port", 3306)
        if db_type in ["mysql", "postgresql"]:
            if "Access denied" in err_str:
                return False, f"Acceso denegado en el servidor ({host}): Usuario o contraseña incorrectos."
            elif "Unknown database" in err_str:
                return False, f"Servidor alcanzado ({host}), pero la base de datos '{cfg.get('database')}' no existe."
            else:
                return False, (
                    f"No se pudo conectar al servidor local en red ({host}:{port}).\n\n"
                    "Por favor verifique:\n"
                    "1. Que la PC Servidor esté encendida y conectada a la red del instituto.\n"
                    "2. Que la IP sea correcta (ej: 192.168.1.100).\n"
                    f"3. Que el servicio de base de datos esté iniciado y el firewall permita el puerto {port}."
                )
        return False, f"Error al verificar base de datos local: {err_str}"

def hash_password(plain_password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")

def check_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def _ensure_schema_columns(engine):
    """
    Verifica y aplica migraciones automáticas no destructivas de forma agnóstica al motor
    (SQLite, MySQL, PostgreSQL), garantizando las columnas de RN-01, RN-02 y RN-03 sin pérdida de datos.
    """
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())

        with engine.connect() as conn:
            # 1. Tabla designations
            if "designations" in tables:
                desig_cols = {c["name"] for c in inspector.get_columns("designations")}
                if "cargo" not in desig_cols:
                    conn.execute(text("ALTER TABLE designations ADD COLUMN cargo VARCHAR(150)"))
                if "revista" not in desig_cols:
                    conn.execute(text("ALTER TABLE designations ADD COLUMN revista VARCHAR(20)"))

            # 2. Tabla attendances
            if "attendances" in tables:
                att_cols = {c["name"] for c in inspector.get_columns("attendances")}
                if "designation_id" not in att_cols:
                    conn.execute(text("ALTER TABLE attendances ADD COLUMN designation_id INTEGER"))
                if "is_active" not in att_cols:
                    conn.execute(text("ALTER TABLE attendances ADD COLUMN is_active BOOLEAN DEFAULT 1"))

            # 3. Tabla users (campos de seguridad y recuperación)
            if "users" in tables:
                user_cols = {c["name"] for c in inspector.get_columns("users")}
                if "security_question" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN security_question VARCHAR(255)"))
                if "security_answer_hash" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN security_answer_hash VARCHAR(255)"))
                if "recovery_key_hash" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN recovery_key_hash VARCHAR(255)"))
                if "recovery_key" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN recovery_key VARCHAR(100)"))

            conn.commit()
    except Exception as e:
        print(f"[SIGET DB] Nota en verificación de esquema: {e}")


def init_db(cfg: dict = None):
    """
    Inicializa las tablas y carga datos de demostración si la base está vacía.
    """
    engine = get_engine(cfg, force_reconnect=True)
    Base.metadata.create_all(bind=engine)
    _ensure_schema_columns(engine)

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
                full_name="María Eugenia Giménez (Bedelía)",
                role="BEDEL",
                email="bedelia@siget-edu.ar",
                is_active=True
            )
            secretaria_user = User(
                username="secretaria",
                password_hash=hash_password("secretaria123"),
                full_name="Prof. María Eva Duarte (Secretaría)",
                role="SECRETARIA",
                email="secretaria@siget-edu.ar",
                is_active=True
            )
            session.add_all([rector_user, secretaria_user, bedel_user])
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
