import { QueueService } from '../queue.service';

describe('QueueService', () => {
  let queueService: QueueService;

  beforeEach(() => {
    queueService = new QueueService();
  });

  it('should create an instance of QueueService', () => {
    expect(queueService).toBeInstanceOf(QueueService);
  });

  it('should have an empty tasks array initially', () => {
    expect(queueService.tasks).toEqual([]);
  });

  it('should resolve tasks in the order they are added', async () => {
    const task1 = jest.fn().mockResolvedValue('Task 1');
    const task2 = jest.fn().mockResolvedValue('Task 2');
    const task3 = jest.fn().mockResolvedValue('Task 3');

    const promise1 = queueService.add(task1);
    const promise2 = queueService.add(task2);
    const promise3 = queueService.add(task3);

    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

    expect(result1).toBe('Task 1');
    expect(result2).toBe('Task 2');
    expect(result3).toBe('Task 3');
    expect(task1).toHaveBeenNthCalledWith(1);
    expect(task2).toHaveBeenNthCalledWith(1);
    expect(task3).toHaveBeenNthCalledWith(1);
  });

  it('should handle rejected tasks', async () => {
    const task1 = jest.fn().mockResolvedValue('Task 1');
    const task2 = jest.fn().mockRejectedValue(new Error('Task 2 failed'));
    const task3 = jest.fn().mockResolvedValue('Task 3');

    const promise1 = queueService.add(task1);
    const promise2 = queueService.add(task2).catch((error) => error.message);
    const promise3 = queueService.add(task3);

    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

    expect(result1).toBe('Task 1');
    expect(result2).toBe('Task 2 failed');
    expect(result3).toBe('Task 3');
    expect(task1).toHaveBeenNthCalledWith(1);
    expect(task2).toHaveBeenNthCalledWith(1);
    expect(task3).toHaveBeenNthCalledWith(1);
  });
});
