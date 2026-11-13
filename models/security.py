"""
Módulo de Seguridad, Jerarquía de Roles y Guardas de Control de Acceso para SIGET.
Implementa la matriz estricta de privilegios institucionales para el IESETyFP:

Jerarquía Institucional:
  - Nivel 3 (RECTOR): Privilegios globales de auditoría, configuración, gestión de planta y administración total de usuarios.
  - Nivel 2 (SECRETARIA): Administración de expedientes, docentes, cátedras, designaciones, suplencias y reportes oficiales.
  - Nivel 1 (BEDEL): Control operativo diario de asistencias, novedades de planta y matrícula/inscripción de alumnos.

Regla Estricta de Protección de Cuentas:
  Ningún rol inferior puede modificar, dar de baja lógica, alterar credenciales o blanquear contraseñas
  de cuentas o registros pertenecientes a un nivel jerárquico igual o superior.
"""

from functools import wraps
from typing import Optional, Union, Callable
from database.schema import get_argentina_now

ROLE_LEVELS = {
    "RECTOR": 3,
    "SECRETARIA": 2,
    "SECRETARIO": 2,
    "BEDEL": 1,
    "BEDELIA": 1
}

ROLE_DISPLAY = {
    "RECTOR": "Rector / Directivo",
    "SECRETARIA": "Secretaría",
    "BEDEL": "Bedelía"
}

# Matriz estricta de permisos por rol
PERMISSIONS_MATRIX = {
    # Configuración del sistema y auditoría
    "CONFIG_DATABASE": ["RECTOR"],
    "AUDIT_VIEW_GLOBAL": ["RECTOR"],
    
    # Gestión de usuarios y credenciales
    "USERS_VIEW": ["RECTOR"],
    "USERS_CREATE": ["RECTOR"],
    "USERS_UPDATE": ["RECTOR"],
    "USERS_TOGGLE_ACTIVE": ["RECTOR"],
    "USERS_RESET_PASSWORD": ["RECTOR"],
    
    # Reportes oficiales
    "REPORTS_EXPORT": ["RECTOR", "SECRETARIA", "SECRETARIO"],
    "REPORTS_VIEW": ["RECTOR", "SECRETARIA", "SECRETARIO"],
    
    # Gestión de Planta Docente (Altas, Bajas, Modificaciones)
    "TEACHERS_MANAGE": ["RECTOR", "SECRETARIA", "SECRETARIO"],
    "TEACHERS_VIEW": ["RECTOR", "SECRETARIA", "SECRETARIO", "BEDEL", "BEDELIA"],
    
    # Gestión de Designaciones y Cátedras
    "DESIGNATIONS_MANAGE": ["RECTOR", "SECRETARIA", "SECRETARIO"],
    "DESIGNATIONS_VIEW": ["RECTOR", "SECRETARIA", "SECRETARIO", "BEDEL", "BEDELIA"],
    
    # Matrícula de Alumnos (Bedelía, Secretaría y Rector)
    "STUDENTS_MANAGE": ["RECTOR", "SECRETARIA", "SECRETARIO", "BEDEL", "BEDELIA"],
    "STUDENTS_VIEW": ["RECTOR", "SECRETARIA", "SECRETARIO", "BEDEL", "BEDELIA"],
    
    # Control Diario de Asistencias (Bedelía, Secretaría y Rector)
    "ATTENDANCE_MANAGE": ["RECTOR", "SECRETARIA", "SECRETARIO", "BEDEL", "BEDELIA"],
    "ATTENDANCE_VIEW": ["RECTOR", "SECRETARIA", "SECRETARIO", "BEDEL", "BEDELIA"]
}

def normalize_role(role: Optional[str]) -> str:
    """Normaliza variantes del rol al conjunto cerrado: 'RECTOR', 'SECRETARIA', 'BEDEL'."""
    if not role:
        return "BEDEL"
    r = str(role).strip().upper()
    if r in ["RECTOR", "RECTORA", "DIRECTIVO"]:
        return "RECTOR"
    if r in ["SECRETARIA", "SECRETARIO", "SECRETARÍA"]:
        return "SECRETARIA"
    if r in ["BEDEL", "BEDELIA", "BEDELÍA"]:
        return "BEDEL"
    return r

def get_role_level(role: Optional[str]) -> int:
    """Retorna el peso numérico de jerarquía del rol (Rector=3, Secretaría=2, Bedel=1)."""
    norm = normalize_role(role)
    return ROLE_LEVELS.get(norm, 1)

def can_manage_target_role(actor_role: Optional[str], target_role: Optional[str]) -> bool:
    """
    Evalúa si actor_role tiene jerarquía suficiente para administrar una cuenta con target_role.
    - Rector (3) puede gestionar cuentas de Rector, Secretaría y Bedelía.
    - Secretaría (2) solo podría gestionar Bedelía (1), nunca Secretaría (2) ni Rector (3).
    - Bedelía (1) NO puede gestionar cuentas de ningún usuario.
    """
    actor_lvl = get_role_level(actor_role)
    target_lvl = get_role_level(target_role)

    # Bedelía carece de privilegios sobre usuarios
    if actor_lvl <= 1:
        return False

    # Rector tiene control administrativo global
    if actor_lvl >= 3:
        return True

    # Secretaría solo puede administrar roles estrictamente inferiores
    return actor_lvl > target_lvl

class PermissionDeniedError(Exception):
    """Excepción lanzada cuando una guarda de seguridad intercepta un intento no autorizado."""
    def __init__(self, message: str, required_role: Optional[str] = None, actor_role: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.required_role = required_role
        self.actor_role = actor_role

class SecurityGuard:
    """
    Motor central de validación y aplicación de guardas de seguridad.
    Intercepta accesos no autorizados a nivel de lógica de negocio y registra en auditoría.
    """

    @staticmethod
    def get_current_actor():
        """Obtiene el usuario de la sesión activa en CurrentSession."""
        from models.auth import CurrentSession
        return CurrentSession.user

    @classmethod
    def check_permission(cls, permission_name: str, raise_exception: bool = False) -> tuple[bool, str]:
        """
        Verifica si la sesión actual posee el permiso especificado en PERMISSIONS_MATRIX.
        Retorna (True, 'OK') si está autorizado, o (False, error_msg) si es rechazado.
        """
        actor = cls.get_current_actor()
        if not actor:
            msg = "Acceso denegado: No existe una sesión activa autenticada en el sistema."
            if raise_exception:
                raise PermissionDeniedError(msg)
            return False, msg

        allowed_roles = PERMISSIONS_MATRIX.get(permission_name, ["RECTOR"])
        norm_actor_role = normalize_role(actor.role)

        if norm_actor_role not in allowed_roles:
            role_disp = ROLE_DISPLAY.get(norm_actor_role, norm_actor_role)
            msg = (
                f"Acceso denegado: El rol '{role_disp}' no posee privilegios para '{permission_name}'. "
                f"Esta operación requiere autorización de: {', '.join(allowed_roles)} (IESETyFP)."
            )
            # Registrar intento fallido en auditoría
            cls._log_security_violation("VIOLACION_PERMISO", f"{msg} (Usuario: {actor.username})")
            if raise_exception:
                raise PermissionDeniedError(msg, required_role=str(allowed_roles), actor_role=norm_actor_role)
            return False, msg

        return True, "Operación autorizada."

    @classmethod
    def check_hierarchy(cls, target_role: str, action: str = "administrar cuenta", raise_exception: bool = False) -> tuple[bool, str]:
        """
        Verifica si el actor actual puede operar sobre un usuario con target_role.
        Evita que roles menores alteren o eliminen cuentas de roles superiores.
        """
        actor = cls.get_current_actor()
        if not actor:
            msg = "Acceso denegado: No existe sesión autenticada."
            if raise_exception:
                raise PermissionDeniedError(msg)
            return False, msg

        norm_actor = normalize_role(actor.role)
        norm_target = normalize_role(target_role)

        if not can_manage_target_role(norm_actor, norm_target):
            actor_disp = ROLE_DISPLAY.get(norm_actor, norm_actor)
            target_disp = ROLE_DISPLAY.get(norm_target, norm_target)
            msg = (
                f"Violación de jerarquía de seguridad: El rol '{actor_disp}' no tiene permisos "
                f"para {action} sobre cuentas de nivel superior o protegido '{target_disp}' (IESETyFP)."
            )
            cls._log_security_violation("VIOLACION_JERARQUIA", f"{msg} (Actor: {actor.username}, Destino: {norm_target})")
            if raise_exception:
                raise PermissionDeniedError(msg, required_role=norm_target, actor_role=norm_actor)
            return False, msg

        return True, "Jerarquía validada."

    @staticmethod
    def _log_security_violation(action: str, details: str):
        """Registra el evento de violación en la tabla de auditoría con rollback seguro."""
        try:
            from database.connection import get_db_session
            from database.schema import AuditLog
            from models.auth import CurrentSession
            
            session = get_db_session()
            try:
                username = CurrentSession.user.username if CurrentSession.user else "ANONIMO"
                user_id = CurrentSession.user.id if CurrentSession.user else None
                audit = AuditLog(
                    user_id=user_id,
                    username=username,
                    action=action,
                    details=details[:500],
                    timestamp=get_argentina_now()
                )
                session.add(audit)
                session.commit()
            except Exception:
                session.rollback()
            finally:
                session.close()
        except Exception:
            pass

def require_permission(permission_name: str):
    """
    Decorador para métodos de servicio que retornan tuplas (bool, str).
    Intercepta la ejecución si la sesión activa no posee el permiso requerido.
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            ok, msg = SecurityGuard.check_permission(permission_name, raise_exception=False)
            if not ok:
                return False, msg
            return func(*args, **kwargs)
        return wrapper
    return decorator

def require_role(*allowed_roles: str):
    """
    Decorador que restringe la ejecución de un método a un subconjunto de roles.
    """
    norm_allowed = [normalize_role(r) for r in allowed_roles]
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            from models.auth import CurrentSession
            if not CurrentSession.is_authenticated():
                return False, "Acceso denegado: Sesión no autenticada."
            actor_role = normalize_role(CurrentSession.user.role)
            if actor_role not in norm_allowed:
                role_disp = ROLE_DISPLAY.get(actor_role, actor_role)
                msg = (
                    f"Acceso denegado: El rol '{role_disp}' no posee privilegios para ejecutar esta acción. "
                    f"Roles autorizados: {', '.join(norm_allowed)}."
                )
                SecurityGuard._log_security_violation("VIOLACION_ROL", f"{msg} (Usuario: {CurrentSession.user.username})")
                return False, msg
            return func(*args, **kwargs)
        return wrapper
    return decorator

