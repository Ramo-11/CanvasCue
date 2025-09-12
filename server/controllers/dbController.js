const mongoose = require('mongoose');
const { logger } = require('../utils/services');

const connectDB = async () => {
    const isProd = process.env.NODE_ENV === 'production';
    const baseUri = isProd ? process.env.MONGODB_URI_PROD : process.env.MONGODB_URI_DEV;
    const dbName = isProd ? process.env.DB_NAME_PROD : process.env.DB_NAME_DEV;

    if (!baseUri) {
        logger.error('MongoDB URI is not defined');
        return false;
    }

    const mongoUri = `${baseUri}${dbName}?retryWrites=true&w=majority&appName=MainCluster`;

    try {
        await mongoose.connect(mongoUri);
        logger.info(`MongoDB connected successfully`);
        logger.debug(`Connected to: ${mongoUri}`);
        return true;
    } catch (error) {
        logger.error('Unable to connect to database');
        logger.debug(error);
        return false;
    }
};

module.exports = connectDB;
