import { AppError } from '../middleware/errorHandler';

describe('AppError', () => {
  it('should create an error with message and statusCode', () => {
    const err = new AppError('Not found', 404);
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe('AppError');
  });

  it('should default statusCode to 400', () => {
    const err = new AppError('Bad request');
    expect(err.statusCode).toBe(400);
  });

  it('should store an optional error code', () => {
    const err = new AppError('Conflict', 409, 'DUPLICATE_SKU');
    expect(err.code).toBe('DUPLICATE_SKU');
  });

  it('should be an instance of Error', () => {
    const err = new AppError('Something went wrong');
    expect(err instanceof Error).toBe(true);
  });
});
