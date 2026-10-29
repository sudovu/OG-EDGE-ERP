import jwt from "jsonwebtoken";
import { config } from "../../config";

export interface JwtPayload {
  sub: string; // user id
  email: string;
  isSuperAdmin: boolean;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}

