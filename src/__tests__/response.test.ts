import { sendSuccess, sendError, sendCreated, paginationMeta, getPaginationParams } from '../utils/response';

// Mock Express response object
function mockRes() {
  const res: Record<string, unknown> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as unknown as import('express').Response;
}

describe('Response utilities', () => {
  describe('sendSuccess', () => {
    it('should send 200 with success: true', () => {
      const res = mockRes();
      sendSuccess(res, { id: 1 }, 'Done');
      expect((res.status as jest.Mock).mock.calls[0][0]).toBe(200);
      expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({
        success: true,
        message: 'Done',
        data: { id: 1 },
      });
    });
  });

  describe('sendCreated', () => {
    it('should send 201 with success: true', () => {
      const res = mockRes();
      sendCreated(res, { id: 2 });
      expect((res.status as jest.Mock).mock.calls[0][0]).toBe(201);
    });
  });

  describe('sendError', () => {
    it('should send error with success: false', () => {
      const res = mockRes();
      sendError(res, 'Not found', 404);
      expect((res.status as jest.Mock).mock.calls[0][0]).toBe(404);
      expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({
        success: false,
        message: 'Not found',
      });
    });

    it('should include validation errors if provided', () => {
      const res = mockRes();
      sendError(res, 'Validation failed', 422, [{ field: 'email', message: 'Invalid' }]);
      const json = (res.json as jest.Mock).mock.calls[0][0];
      expect(json.errors).toHaveLength(1);
      expect(json.errors[0].field).toBe('email');
    });
  });

  describe('paginationMeta', () => {
    it('calculates total pages correctly', () => {
      const meta = paginationMeta(100, 1, 20);
      expect(meta.totalPages).toBe(5);
      expect(meta.hasNext).toBe(true);
      expect(meta.hasPrev).toBe(false);
    });

    it('returns hasNext=false on last page', () => {
      const meta = paginationMeta(100, 5, 20);
      expect(meta.hasNext).toBe(false);
      expect(meta.hasPrev).toBe(true);
    });
  });

  describe('getPaginationParams', () => {
    it('returns defaults when no query params', () => {
      const params = getPaginationParams({});
      expect(params.page).toBe(1);
      expect(params.limit).toBe(20);
      expect(params.skip).toBe(0);
    });

    it('caps limit at 100', () => {
      const params = getPaginationParams({ limit: '9999' });
      expect(params.limit).toBe(100);
    });

    it('enforces minimum page of 1', () => {
      const params = getPaginationParams({ page: '-5' });
      expect(params.page).toBe(1);
    });

    it('calculates skip correctly', () => {
      const params = getPaginationParams({ page: '3', limit: '10' });
      expect(params.skip).toBe(20);
    });
  });
});
