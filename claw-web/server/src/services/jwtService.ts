import * as jose from 'jose'

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production-min-32-chars'
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h'

function getSecretKey(): Uint8Array {
  const secret = JWT_SECRET.padEnd(32, '0').slice(0, 32)
  return new TextEncoder().encode(secret)
}

export interface TokenPayload {
  userId: string
  email?: string
  isAdmin?: boolean
}

export async function generateToken(payload: TokenPayload): Promise<string> {
  const secret = getSecretKey()
  const token = await new jose.SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(secret)
  return token
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const secret = getSecretKey()
    const { payload } = await jose.jwtVerify(token, secret)
    return {
      userId: payload.userId as string,
      email: payload.email as string | undefined,
      isAdmin: payload.isAdmin as boolean | undefined,
    }
  } catch {
    return null
  }
}

export async function extractTokenFromHeader(authHeader: string | null): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7)
}
