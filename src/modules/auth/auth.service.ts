import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { config } from '../../config';
import { AppError } from '../../middleware/errorHandler';
import { createAuditLog } from '../../middleware/auditLog';
import { AuditAction, Role } from '@prisma/client';
import type { JwtPayload } from '../../middleware/auth';
import type { RegisterInput, LoginInput, ChangePasswordInput } from './auth.schema';

// ─── Token helpers ────────────────────────────────────────────

function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}

function signRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  } as jwt.SignOptions);
}

function refreshTokenExpiryDate(): Date {
  const ms = parseDuration(config.jwt.refreshExpiresIn);
  return new Date(Date.now() + ms);
}

function parseDuration(dur: string): number {
  const match = /^(\d+)([smhd])$/.exec(dur);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const map: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * (map[unit] || 86400000);
}

// ─── Service functions ────────────────────────────────────────

export async function register(
  input: RegisterInput,
  creatorRole?: Role,
  ipAddress?: string,
): Promise<{ user: object; accessToken: string; refreshToken: string }> {
  // Only SUPER_ADMIN can create SUPER_ADMIN/ADMIN accounts
  if (input.role && ['SUPER_ADMIN', 'ADMIN'].includes(input.role)) {
    if (creatorRole !== Role.SUPER_ADMIN) {
      throw new AppError('Only SUPER_ADMIN can create admin accounts', 403);
    }
  }

  const passwordHash = await bcrypt.hash(input.password, config.bcrypt.rounds);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      role: (input.role as Role) || Role.CASHIER,
    },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  const jwtPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = signAccessToken(jwtPayload);
  const refreshToken = signRefreshToken(jwtPayload);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: refreshTokenExpiryDate(),
    },
  });

  await createAuditLog({
    userId: user.id,
    action: AuditAction.CREATE,
    entityType: 'User',
    entityId: user.id,
    description: `User registered: ${user.email}`,
    ipAddress,
  });

  return { user, accessToken, refreshToken };
}

export async function login(
  input: LoginInput,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ user: object; accessToken: string; refreshToken: string }> {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.emailOrUsername }, { username: input.emailOrUsername }],
      isActive: true,
    },
  });

  if (!user) throw new AppError('Invalid credentials', 401);

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!isPasswordValid) throw new AppError('Invalid credentials', 401);

  // Update last login timestamp
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const jwtPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = signAccessToken(jwtPayload);
  const refreshToken = signRefreshToken(jwtPayload);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: refreshTokenExpiryDate(),
    },
  });

  await createAuditLog({
    userId: user.id,
    action: AuditAction.LOGIN,
    entityType: 'User',
    entityId: user.id,
    description: `User logged in: ${user.email}`,
    ipAddress,
    userAgent,
  });

  const { passwordHash: _, ...safeUser } = user;

  return { user: safeUser, accessToken, refreshToken };
}

export async function refreshTokens(
  token: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
    throw new AppError('Refresh token revoked or expired', 401);
  }

  // Rotate: revoke old token, issue new pair
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { isRevoked: true },
  });

  const jwtPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
  };

  const newAccessToken = signAccessToken(jwtPayload);
  const newRefreshToken = signRefreshToken(jwtPayload);

  await prisma.refreshToken.create({
    data: {
      token: newRefreshToken,
      userId: payload.sub,
      expiresAt: refreshTokenExpiryDate(),
    },
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(userId: string, token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, token },
    data: { isRevoked: true },
  });

  await createAuditLog({
    userId,
    action: AuditAction.LOGOUT,
    entityType: 'User',
    entityId: userId,
    description: 'User logged out',
  });
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!isValid) throw new AppError('Current password is incorrect', 400);

  const newHash = await bcrypt.hash(input.newPassword, config.bcrypt.rounds);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  // Revoke all refresh tokens — force re-login on all devices
  await prisma.refreshToken.updateMany({
    where: { userId },
    data: { isRevoked: true },
  });

  await createAuditLog({
    userId,
    action: AuditAction.UPDATE,
    entityType: 'User',
    entityId: userId,
    description: 'Password changed',
  });
}

export async function getProfile(userId: string): Promise<object> {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}
