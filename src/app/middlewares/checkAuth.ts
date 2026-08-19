import { Request, Response, NextFunction } from "express"
import ApiError from "../../errors/ApiErrors"
import { StatusCodes } from "http-status-codes"
import { jwtHelper } from "../../helpers/jwtHelper"
import config from "../../config"
import { User } from "../modules/user/user.model"
import { STATUS } from "../../enums/user"
import { JwtPayload } from "jsonwebtoken"
import { AuthJwtPayload } from "../../types"



export const checkAuth = (...authRoles: string[]) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const accessToken = req.headers.authorization?.split(" ")[1]

        if (!accessToken) {
            throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized, access token is missing")
        }

        const verifiedToken = await jwtHelper.verifyToken(accessToken, config.jwt.jwt_secret as string
        ) as AuthJwtPayload

        console.log(verifiedToken)
        const isUserExist = await User.findOne({ email: verifiedToken.email })

        if (!isUserExist) {
            throw new ApiError(StatusCodes.BAD_REQUEST, "User not found")

        }

        if (isUserExist.status === STATUS.INACTIVE) {
            throw new ApiError(StatusCodes.BAD_REQUEST, "You are inactive user")


        }

        if (authRoles.length > 0 && !authRoles.includes(verifiedToken.role)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, "You are not permitted for the route")
        }

        req.user = verifiedToken
        next()
    } catch (error) {
        next(error)
    }

}