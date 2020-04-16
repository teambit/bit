import { Logger, Level, LogEntry } from './Logger';

describe('logger', function() {
  describe('should support logging by level', function() {
    const results = [];
    const logger = new Logger();
    logger.listen(results.push.bind(results) as any);
    Object.keys(Level).forEach(function(level) {
      it(`:${level}`, function() {
        logger[level]('TEST!', 'this is a test');
      });
    });
  });

  it('should support listening to logs', function() {});
});
