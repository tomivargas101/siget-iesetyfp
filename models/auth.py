from datetime import datetime
from database.connection import get_db_session, check_password, hash_password
from database.schema import User, AuditLog

class UserDTO:
    def __init__(self, id, username, full_name, role, email, is_active, last_login=None):
        self.id = id
        self.username = username
        self.full_name = full_name
        self.role = role
        self.email = email
        self.is_active = is_active
        self.last_login = last_login

    @classmethod
    def from_orm(cls, user):
        return cls(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            role=user.role,
            email=user.email,
            is_active=user.is_active,
            last_login=user.last_login
        )

class CurrentSession:
    user = None
    login_time = None

    @classmethod
    def set_user(cls, user):
        if isinstance(user, User):
            cls.user = UserDTO.from_orm(user)
        else:
            cls.user = user
        cls.login_time = datetime.now()

    @classmethod
    def clear(cls):
        cls.user = None
        cls.login_time = None

    @classmethod
    def is_authenticated(cls) -> bool:
        return cls.user is not None

    @classmethod
    def has_role(cls, *roles) -> bool:
        if not cls.user:
            return False
        return cls.user.role in roles

    @classmethod
    def is_rector(cls) -> bool:
        return cls.has_role("RECTOR")

    @classmethod
    def is_bedel(cls) -> bool:
        return cls.has_role("BEDEL")

class AuthService:
    @staticmethod
    def login(username: str, password: str):
        """
        Valida credenciales contra la BD con bcrypt y registra auditoría.
        Retorna (True, UserDTO) si es exitoso, (False, error_message) si falla.
        """
        if not username or not password:
            return False, "Por favor complete usuario y contraseña."

        session = get_db_session()
        try:
            user = session.query(User).filter(User.username == username.strip()).first()
            if not user:
                return False, "Usuario o contraseña incorrectos."

            if not user.is_active:
                return False, "La cuenta de usuario se encuentra inhabilitada."

            if not check_password(password, user.password_hash):
                return False, "Usuario o contraseña incorrectos."

            # Actualizar último acceso
            user.last_login = datetime.utcnow()
            
            # Registrar log de auditoría
            audit = AuditLog(
                user_id=user.id,
                username=user.username,
                action="INICIO_SESION",
                details=f"Acceso con rol {user.role}"
            )
            session.add(audit)
            session.commit()

            user_dto = UserDTO.from_orm(user)
            CurrentSession.set_user(user_dto)
            return True, user_dto
        except Exception as e:
            session.rollback()
            return False, f"Error al conectar con la base de datos: {str(e)}"
        finally:
            session.close()

    @staticmethod
    def logout():
        if CurrentSession.is_authenticated():
            session = get_db_session()
            try:
                audit = AuditLog(
                    user_id=CurrentSession.user.id,
                    username=CurrentSession.user.username,
                    action="CIERRE_SESION",
                    details="Cierre de sesión manual"
                )
                session.add(audit)
                session.commit()
            except Exception:
                session.rollback()
            finally:
                session.close()
        CurrentSession.clear()

    @staticmethod
    def log_action(action: str, details: str = ""):
        session = get_db_session()
        try:
            username = CurrentSession.user.username if CurrentSession.user else "SISTEMA"
            user_id = CurrentSession.user.id if CurrentSession.user else None
            audit = AuditLog(
                user_id=user_id,
                username=username,
                action=action,
                details=details
            )
            session.add(audit)
            session.commit()
        except Exception:
            session.rollback()
        finally:
            session.close()
