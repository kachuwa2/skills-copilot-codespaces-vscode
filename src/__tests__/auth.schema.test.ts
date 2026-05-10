import { registerSchema, loginSchema, changePasswordSchema } from '../modules/auth/auth.schema';

describe('Auth schema validation', () => {
  describe('registerSchema', () => {
    it('should validate a valid registration payload', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        username: 'testuser',
        password: 'SecurePass1',
        firstName: 'Test',
        lastName: 'User',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = registerSchema.safeParse({
        email: 'not-an-email',
        username: 'testuser',
        password: 'SecurePass1',
        firstName: 'Test',
        lastName: 'User',
      });
      expect(result.success).toBe(false);
    });

    it('should reject username with special chars', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        username: 'test user!',
        password: 'SecurePass1',
        firstName: 'Test',
        lastName: 'User',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short password', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        username: 'testuser',
        password: 'short',
        firstName: 'Test',
        lastName: 'User',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('should validate with email', () => {
      const result = loginSchema.safeParse({
        emailOrUsername: 'user@example.com',
        password: 'anypassword',
      });
      expect(result.success).toBe(true);
    });

    it('should validate with username', () => {
      const result = loginSchema.safeParse({
        emailOrUsername: 'myusername',
        password: 'anypassword',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty credentials', () => {
      const result = loginSchema.safeParse({
        emailOrUsername: '',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('changePasswordSchema', () => {
    it('should validate correct payload', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'OldPass123',
        newPassword: 'NewPass456',
      });
      expect(result.success).toBe(true);
    });

    it('should reject short new password', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'OldPass123',
        newPassword: 'short',
      });
      expect(result.success).toBe(false);
    });
  });
});
