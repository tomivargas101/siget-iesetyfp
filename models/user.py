"""
Servicio de Gestión de Usuarios y Credenciales con Guardas Jerárquicas para SIGET (Python / SQLAlchemy).
Asegura que los roles operativos (Bedelía) no puedan modificar, eliminar ni alterar credenciales
del rol administrativo y de gestión (Secretaría), garantizando la integridad de cuentas institucionales.
"""

from typing import Optional, List, Dict, Any, Tuple
from database.connection import get_db_session, hash_password
from database.schema import User, AuditLog, get_argentina_now
from models.security import SecurityGuard, normalize_role, can_manage_target_role, ROLE_DISPLAY
from models.auth import CurrentSession, AuthService

class UserService:
    @staticmethod
    def get_all() -> List[Dict[str, Any]]:
        """
        Retorna la lista completa de usuarios ordenada por jerarquía.
        Requiere rol SECRETARIA con permiso USERS_VIEW.
        """
        ok, msg = SecurityGuard.check_permission("USERS_VIEW")
        if not ok:
            return []

        session = get_db_session()
        try:
            users = session.query(User).order_by(
                User.role.asc(),
                User.full_name.asc()
            ).all()

            results = []
            for u in users:
                results.append({
                    "id": u.id,
                    "username": u.username,
                    "full_name": u.full_name,
                    "role": normalize_role(u.role),
                    "email": u.email or "",
                    "is_active": u.is_active,
                    "created_at": u.created_at.strftime("%Y-%m-%d %H:%M:%S") if u.created_at else "",
                    "last_login": u.last_login.strftime("%Y-%m-%d %H:%M:%S") if u.last_login else "Nunca",
                    "has_security_question": bool(u.security_question),
                    "has_recovery_key": bool(u.recovery_key or u.recovery_key_hash)
                })
            return results
        finally:
            session.close()

    @staticmethod
    def get_by_id(user_id: int) -> Optional[Dict[str, Any]]:
        session = get_db_session()
        try:
            u = session.query(User).filter(User.id == user_id).first()
            if not u:
                return None
            return {
                "id": u.id,
                "username": u.username,
                "full_name": u.full_name,
                "role": normalize_role(u.role),
                "email": u.email or "",
                "is_active": u.is_active,
                "security_question": u.security_question or ""
            }
        finally:
            session.close()

    @staticmethod
    def create_user(
        full_name: str,
        username: str,
        password: str,
        role: str = "BEDEL",
        email: str = "",
        security_question: str = "",
        security_answer: str = ""
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Crea un nuevo usuario en la base de datos validando jerarquía de sesión.
        """
        # Si hay sesión iniciada, validar permisos de creación y jerarquía
        if CurrentSession.is_authenticated():
            ok, msg = SecurityGuard.check_permission("USERS_CREATE")
            if not ok:
                return False, msg, None

            norm_target_role = normalize_role(role)
            ok_h, msg_h = SecurityGuard.check_hierarchy(norm_target_role, action=f"crear cuenta con rol '{norm_target_role}'")
            if not ok_h:
                return False, msg_h, None

        return AuthService.register_user(
            full_name=full_name,
            username=username,
            password=password,
            role=role,
            email=email,
            security_question=security_question,
            security_answer=security_answer
        )

    @staticmethod
    def update_user(
        user_id: int,
        full_name: Optional[str] = None,
        role: Optional[str] = None,
        email: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> Tuple[bool, str]:
        """
        Actualiza datos de un usuario interceptando cualquier intento de rol inferior sobre rol superior.
        """
        ok, msg = SecurityGuard.check_permission("USERS_UPDATE")
        if not ok:
            return False, msg

        session = get_db_session()
        try:
            target_user = session.query(User).filter(User.id == user_id).first()
            if not target_user:
                return False, "Usuario no encontrado."

            # Guarda Jerárquica: ¿Puede el actor operar sobre este usuario?
            ok_h, msg_h = SecurityGuard.check_hierarchy(target_user.role, action="modificar usuario")
            if not ok_h:
                return False, msg_h

            # Evitar auto-desactivación del usuario en sesión
            actor = CurrentSession.user
            if actor and actor.id == user_id and is_active is False:
                return False, "No puede desactivar su propia cuenta activa de sesión."

            # Si cambia de rol, verificar que el actor pueda otorgar el nuevo rol
            if role:
                norm_new_role = normalize_role(role)
                if norm_new_role != normalize_role(target_user.role):
                    ok_new, msg_new = SecurityGuard.check_hierarchy(norm_new_role, action=f"asignar rol '{norm_new_role}'")
                    if not ok_new:
                        return False, msg_new
                    target_user.role = norm_new_role

            if full_name:
                target_user.full_name = full_name.strip()
            if email is not None:
                target_user.email = email.strip() if email.strip() else None
            if is_active is not None:
                target_user.is_active = bool(is_active)

            session.commit()
            AuthService.log_action("MODIFICACION_USUARIO", f"Actualizado usuario {target_user.username} (Rol: {target_user.role})")
            return True, f"Usuario '{target_user.username}' actualizado exitosamente."
        except Exception as e:
            session.rollback()
            return False, f"Error al actualizar usuario: {str(e)}"
        finally:
            session.close()

    @staticmethod
    def reset_password(user_id: int, new_password: str) -> Tuple[bool, str]:
        """
        Blanqueo / restablecimiento de contraseña protegido por guardas jerárquicas.
        Impide que Bedelía blanquee contraseñas de Secretaría.
        """
        ok, msg = SecurityGuard.check_permission("USERS_RESET_PASSWORD")
        if not ok:
            return False, msg

        if not new_password or len(new_password) < 6:
            return False, "La nueva contraseña debe tener al menos 6 caracteres."

        session = get_db_session()
        try:
            target_user = session.query(User).filter(User.id == user_id).first()
            if not target_user:
                return False, "Usuario no encontrado."

            # Guarda Jerárquica
            ok_h, msg_h = SecurityGuard.check_hierarchy(target_user.role, action="blanquear contraseña")
            if not ok_h:
                return False, msg_h

            target_user.password_hash = hash_password(new_password)
            session.commit()

            AuthService.log_action(
                "BLANQUEO_CONTRASENA",
                f"Contraseña blanqueada para el usuario '{target_user.username}' ({target_user.role})"
            )
            return True, f"Contraseña blanqueada correctamente para el usuario '{target_user.username}'."
        except Exception as e:
            session.rollback()
            return False, f"Error al blanquear contraseña: {str(e)}"
        finally:
            session.close()

    @staticmethod
    def toggle_active(user_id: int) -> Tuple[bool, str]:
        """
        Cambia el estado activo/inactivo (alta/baja lógica) de un usuario bajo guardas de seguridad.
        """
        ok, msg = SecurityGuard.check_permission("USERS_TOGGLE_ACTIVE")
        if not ok:
            return False, msg

        session = get_db_session()
        try:
            target_user = session.query(User).filter(User.id == user_id).first()
            if not target_user:
                return False, "Usuario no encontrado."

            # Guarda Jerárquica
            ok_h, msg_h = SecurityGuard.check_hierarchy(target_user.role, action="alterar estado de la cuenta")
            if not ok_h:
                return False, msg_h

            actor = CurrentSession.user
            if actor and actor.id == user_id:
                return False, "No puede desactivar su propia cuenta activa de sesión."

            target_user.is_active = not target_user.is_active
            session.commit()

            status_str = "activado" if target_user.is_active else "dado de baja lógica"
            action_code = "REACTIVACION_USUARIO" if target_user.is_active else "BAJA_USUARIO"
            AuthService.log_action(action_code, f"Usuario '{target_user.username}' {status_str}")

            return True, f"El usuario '{target_user.username}' fue {status_str} exitosamente."
        except Exception as e:
            session.rollback()
            return False, f"Error al alterar estado del usuario: {str(e)}"
        finally:
            session.close()

    @staticmethod
    def delete_user(user_id: int) -> Tuple[bool, str]:
        """
        Suprime o desactiva lógicamente una cuenta preservando la auditoría institucional.
        """
        return UserService.toggle_active(user_id)

