from datetime import datetime
import secrets
from database.connection import get_db_session, check_password, hash_password
from database.schema import User, AuditLog, get_argentina_now

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
        cls.login_time = get_argentina_now()

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

    @classmethod
    def is_secretaria(cls) -> bool:
        return cls.has_role("SECRETARIA", "SECRETARIO")

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

            # Actualizar último acceso con hora local de Argentina (GMT-3)
            local_now = get_argentina_now()
            user.last_login = local_now
            
            # Registrar log de auditoría con hora local
            audit = AuditLog(
                user_id=user.id,
                username=user.username,
                action="INICIO_SESION",
                details=f"Acceso con rol {user.role}",
                timestamp=local_now
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
                    details="Cierre de sesión manual",
                    timestamp=get_argentina_now()
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
                details=details,
                timestamp=get_argentina_now()
            )
            session.add(audit)
            session.commit()
        except Exception:
            session.rollback()
        finally:
            session.close()

    @staticmethod
    def generate_master_recovery_key() -> str:
        """Genera una llave maestra de rescate offline con formato SIGET-XXXX-XXXX-XXXX-XXXX."""
        chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
        def chunk():
            return "".join(secrets.choice(chars) for _ in range(4))
        return f"SIGET-{chunk()}-{chunk()}-{chunk()}-{chunk()}"

    @staticmethod
    def check_first_run() -> dict:
        """Verifica si la base de datos de usuarios está vacía o sin rector activo."""
        session = get_db_session()
        try:
            total_users = session.query(User).filter(User.is_active == True).count()
            if total_users == 0:
                return {"is_first_run": True, "reason": "NO_USERS"}
            rector_count = session.query(User).filter(User.role == "RECTOR", User.is_active == True).count()
            if rector_count == 0:
                return {"is_first_run": True, "reason": "NO_ACTIVE_RECTOR"}
            return {"is_first_run": False, "count": total_users}
        except Exception as e:
            return {"is_first_run": False, "error": str(e)}
        finally:
            session.close()

    @staticmethod
    def register_user(
        full_name: str,
        username: str,
        password: str,
        role: str = "BEDEL",
        email: str = "",
        security_question: str = "",
        security_answer: str = ""
    ):
        """
        Registra una nueva cuenta institucional en la base de datos.
        Hashea la contraseña y respuesta de seguridad con bcrypt.
        Si el rol es RECTOR, genera una Master Recovery Key alfanumérica única.
        """
        if not full_name or not username or not password or not security_question or not security_answer:
            return False, "Todos los campos obligatorios deben completarse.", None
        if len(password) < 6:
            return False, "La contraseña debe tener al menos 6 caracteres.", None

        clean_role = (role or "BEDEL").strip().upper()
        if clean_role == "SECRETARIO":
            clean_role = "SECRETARIA"
        if clean_role not in ["RECTOR", "SECRETARIA", "BEDEL"]:
            return False, "Rol institucional no válido. Debe ser RECTOR, SECRETARIA o BEDEL.", None

        session = get_db_session()
        try:
            clean_u = username.strip().lower()
            existing = session.query(User).filter(User.username == clean_u).first()
            if existing:
                return False, f"El nombre de usuario '{clean_u}' ya se encuentra registrado.", None

            pass_hash = hash_password(password)
            ans_hash = hash_password(security_answer.strip().lower())
            master_key = None
            key_hash = None

            if clean_role == "RECTOR":
                master_key = AuthService.generate_master_recovery_key()
                key_hash = hash_password(master_key)

            local_now = get_argentina_now()
            new_user = User(
                username=clean_u,
                password_hash=pass_hash,
                full_name=full_name.strip(),
                role=clean_role,
                email=email.strip() if email else None,
                is_active=True,
                security_question=security_question.strip(),
                security_answer_hash=ans_hash,
                recovery_key=master_key,
                recovery_key_hash=key_hash,
                created_at=local_now
            )
            session.add(new_user)
            session.flush()

            audit = AuditLog(
                user_id=new_user.id,
                username=clean_u,
                action="REGISTRO_CUENTA",
                details=f"Alta institucional de cuenta con rol '{clean_role}' ({full_name.strip()})",
                timestamp=local_now
            )
            session.add(audit)
            session.commit()

            return True, f"Cuenta de '{clean_u}' registrada exitosamente con rol {clean_role}.", master_key
        except Exception as e:
            session.rollback()
            return False, f"Error al registrar la cuenta: {str(e)}", None
        finally:
            session.close()


