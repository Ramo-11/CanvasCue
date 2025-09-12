function sessionValidator({
    UserModel,
    logger = console,
    loginPath = '/login',
    roleRedirects = {},
}) {
    async function validateSession(req, res, next) {
        if (!req.session || !req.session.userId) return next();

        try {
            const user = await UserModel.findById(req.session.userId).select(
                'role isActive email fullName firstName lastName'
            );

            if (!user || !user.isActive) {
                logger.warn(`Invalid session for user ${req.session.userId}`);
                req.session.destroy();
                return res.redirect(loginPath);
            }

            // Set default role if not present
            req.session.userRole = user.role || 'user'; // Default to 'user' if role is undefined
            req.session.userName = user.fullName || `${user.firstName} ${user.lastName}`;
            req.currentUser = user;
            res.locals.user = user;

            next();
        } catch (error) {
            logger.error(`Session validation error: ${error}`);
            req.session.destroy();
            return res.redirect(loginPath);
        }
    }

    function enforceRole(req, res, next) {
        if (!req.session || !req.session.userId) return next();

        const sessionRole = req.session.userRole;
        const path = req.path;

        for (const [prefix, allowedRoles] of Object.entries(roleRedirects)) {
            if (path.startsWith(prefix) && !allowedRoles.includes(sessionRole)) {
                logger.warn(
                    `Role mismatch: User ${req.session.userId} with role ${sessionRole} tried accessing ${path}`
                );
                return res.redirect(loginPath);
            }
        }

        next();
    }

    return { validateSession, enforceRole };
}

module.exports = { sessionValidator };
