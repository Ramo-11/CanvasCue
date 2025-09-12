const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();

function sessionMiddleware({ secret, cookieName = 'app.sid', logger = console }) {
    const isProd = process.env.NODE_ENV === 'production';
    const baseUri = isProd ? process.env.MONGODB_URI_PROD : process.env.MONGODB_URI_DEV;
    const dbName = isProd ? process.env.DB_NAME_PROD : process.env.DB_NAME_DEV;

    if (!baseUri) {
        logger.error('MongoDB URI is not defined for session store');
        throw new Error('MongoDB URI missing');
    }

    const mongoUri = `${baseUri}${dbName}?retryWrites=true&w=majority&appName=MainCluster`;

    return session({
        secret: secret || process.env.SESSION_SECRET || 'default-secret',
        resave: false,
        saveUninitialized: false,
        rolling: true,
        store: MongoStore.create({
            mongoUrl: mongoUri,
            touchAfter: 24 * 3600,
            crypto: {
                secret: secret || process.env.SESSION_SECRET || 'default-secret',
            },
        }),
        cookie: {
            secure: isProd,
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            sameSite: 'lax',
        },
        name: cookieName,
    });
}

module.exports = { sessionMiddleware };
