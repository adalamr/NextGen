import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool } from '../../config/database.config';
import { config } from '../../config/app.config';
import { ApiError } from '../../utils/api-error';

interface RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName?: string;
}

interface LoginDto {
  email: string;
  password: string;
}

export class AuthService {
  private generateTokens(payload: { userId: string; orgId: string; role: string; email: string }) {
    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto) {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if user already exists
      const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [dto.email]);
      if (existingUser.rows.length > 0) {
        throw new ApiError(409, 'User with this email already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(dto.password, 12);

      // Create org if provided
      let orgId: string;
      if (dto.organizationName) {
        const orgResult = await client.query(
          'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
          [dto.organizationName, dto.organizationName.toLowerCase().replace(/\s+/g, '-')],
        );
        orgId = orgResult.rows[0].id;
      } else {
        // Create default personal org
        const orgResult = await client.query(
          "INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id",
          [`${dto.firstName}'s Org`, `${dto.firstName.toLowerCase()}-org-${Date.now()}`],
        );
        orgId = orgResult.rows[0].id;
      }

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, org_id, role)
         VALUES ($1, $2, $3, $4, $5, 'SUPER_ADMIN') RETURNING id, email, first_name, last_name, role, org_id`,
        [dto.email, passwordHash, dto.firstName, dto.lastName, orgId],
      );

      const user = userResult.rows[0];
      await client.query('COMMIT');

      const tokens = this.generateTokens({
        userId: user.id,
        orgId: user.org_id,
        role: user.role,
        email: user.email,
      });

      return {
        user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role },
        ...tokens,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async login(dto: LoginDto) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, role, org_id FROM users WHERE email = $1',
      [dto.email],
    );

    if (result.rows.length === 0) {
      throw new ApiError(401, 'Invalid email or password');
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(dto.password, user.password_hash);

    if (!isValidPassword) {
      throw new ApiError(401, 'Invalid email or password');
    }

    const tokens = this.generateTokens({
      userId: user.id,
      orgId: user.org_id,
      role: user.role,
      email: user.email,
    });

    return {
      user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role },
      ...tokens,
    };
  }

  async refreshToken(token: string) {
    try {
      const payload = jwt.verify(token, config.jwt.refreshSecret) as {
        userId: string;
        orgId: string;
        role: string;
        email: string;
      };

      const tokens = this.generateTokens({
        userId: payload.userId,
        orgId: payload.orgId,
        role: payload.role,
        email: payload.email,
      });

      return tokens;
    } catch {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }
  }
}
