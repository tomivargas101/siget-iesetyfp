"""
Módulo de Seguridad, Jerarquía de Roles y Guardas de Control de Acceso para SIGET.
Implementa la matriz estricta de privilegios institucionales para el IESETyFP:

Jerarquía Institucional (Requerimientos v2.0 - Exclusivamente Secretaría y Bedel):
  - Nivel 2 (SECRETARIA): Administración general institucional, gestión de planta docente,
    cátedras, designaciones, suplencias, importación masiva CSV, reportes oficiales y administración de usuarios.
  - Nivel 1 (BEDEL): Control operativo diario de asistencias, novedades de planta,
    recepción de formularios físicos y consulta de disponibilidad / calendario docente.

Regla Estricta de Protección de Cuentas:
  Ningún rol inferior puede modificar, dar de baja lógica, alterar credenciales o blanquear contraseñas
  de cuentas o registros pertenecientes a un nivel jerárquico igual o superior.
"""

from functools import wraps
from typing import Optional, Union, Callable
from database.schema import get_argentina_now

ROLE_LEVELS = {
    "SECRETARIA": 2,
    "SECRETARIO": 2,
    "BEDEL": 1,
    "BEDELIA": 1
}

ROLE_DISPLAY = {
    "SECRETARIA": "Secretaría",
    "BEDEL": "Bedelía"
}

# Matriz estricta de permisos por rol (Secretaría y Bedelía)
PERMISSIONS_MATRIX = {
    # Configuración del sistema y auditoría
    "CONFIG_DATABASE": ["SECRETARIA"],
    "AUDIT_VIEW_GLOBAL": ["SECRETARIA"],
    
    # Gestión de usuarios y credenciales
    "USERS_VIEW": ["SECRETARIA"],
    "USERS_CREATE": ["SECRETARIA"],
    "USERS_UPDATE": ["SECRETARIA"],
    "USERS_TOGGLE_ACTIVE": ["SECRETARIA"],
    "USERS_RESET_PASSWORD": ["SECRETARIA"],
    
    # Reportes oficiales
    "REPORTS_EXPORT": ["SECRETARIA"],
    "REPORTS_VIEW": ["SECRETARIA", "BEDEL"],
    
    # Gestión de Planta Docente (Altas, Bajas, Modificaciones)
    "TEACHERS_MANAGE": ["SECRETARIA"],
    "TEACHERS_VIEW": ["SECRETARIA", "BEDEL"],
    
    # Gestión de Designaciones y Cátedras
    "DESIGNATIONS_MANAGE": ["SECRETARIA"],
    "DESIGNATIONS_VIEW": ["SECRETARIA", "BEDEL"],

    # Importación Masiva CSV
    "CSV_IMPORT": ["SECRETARIA"],

    # Calendario Docente y Disponibilidad
    "CALENDAR_VIEW": ["SECRETARIA", "BEDEL"],
    
    # Control Diario de Asistencias (Bedelía y Secretaría)
    "ATTENDANCE_MANAGE": ["SECRETARIA", "BEDEL"],
    "ATTENDANCE_VIEW": ["SECRETARIA", "BEDEL"]
}

def normalize_role(role: Optional[str]) -> str:
    """Normaliza variantes del rol al conjunto cerrado: 'SECRETARIA', 'BEDEL'."""
    if not role:
        return "BEDEL"
    r = str(role).strip().upper()
    if r in ["SECRETARIA", "SECRETARIO", "SECRETARÍA", "RECTOR", "RECTORA", "ADMIN"]:
        return "SECRETARIA"
    if r in ["BEDEL", "BEDELIA", "BEDELÍA"]:
        return "BEDEL"
    return "BEDEL"

def get_role_level(role: Optional[str]) -> int:
    """Retorna el peso numérico de jerarquía del rol (Secretaría=2, Bedel=1)."""
    norm = normalize_role(role)
    return ROLE_LEVELS.get(norm, 1)

def can_manage_target_role(actor_role: Optional[str], target_role: Optional[str]) -> bool:
    """
    Evalúa si actor_role tiene jerarquía suficiente para administrar una cuenta con target_role.
    - Secretaría (2) puede gestionar cuentas de Bedelía (1).
    - Bedelía (1) NO puede gestionar cuentas de ningún usuario.
    """
    actor_lvl = get_role_level(actor_role)
    target_lvl = get_role_level(target_role)

    # Bedelía carece de privilegios sobre usuarios
    if actor_lvl <= 1:
        return False

    # Secretaría solo puede administrar roles estrictamente inferiores (Bedelía)
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

