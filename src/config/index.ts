
import dotenv from "dotenv"
import path from "path"


dotenv.config({path: path.join(process.cwd(), ".env") })

export default {
    port: process.env.PORT,
    database_url: process.env.DATABASE_URL,
    node_env: process.env.NODE_ENV,
    client_url: process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:3000',
    bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
    jwt: {
        jwt_secret: process.env.JWT_SECRET,
        jwt_expire_in: process.env.JWT_EXPIRE_IN,
        jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
        jwt_refresh_expire_in: process.env.JWT_REFRESH_EXPIRE_IN
    },

    email: {
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
        from: process.env.EMAIL_FROM
    },

    admin: {
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD
    },
    
    rate_limit: {
        limit: process.env.EXPRESS_RATE_LIMIT,
        in_minutes: process.env.EXPRESS_RATE_LIMIT_IN_MINUTES
    },
    stripe: {
        secret_key: process.env.STRIPE_SECRET_KEY,
        api_key: process.env.STRIPE_API_KEY,
        webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
        success_url:process.env.STRIPE_SUCCESS_URL,
        cancel_url: process.env.STRIPE_CANCEL_URL
    },

    google: {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        callback_url: process.env.GOOGLE_CALLBACK_URL
    },
    fees: {
    
    platformFeePercent: process.env.PLATFORM_FEE_PERCENT || '15',
  },

  firebase: {
    projectId:   process.env.FCM_PROJECT_ID,
    // Replace literal \n back to real newlines in private key
    privateKey:  process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FCM_CLIENT_EMAIL,
  },

 
  holdDurationMinutes: Number(process.env.BOOKING_HOLD_MINUTES) || 30,

}