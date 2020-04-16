import { expect } from 'chai';
import { Logger } from './Logger';

describe('logger', function() {
  it('should support log', function(done) {
    const logger = new Logger();
    logger.listen(done);
    logger.log('TEST!', 'message');
  });

  it('should support listening to logs', function() {
    const logger = new Logger();
    const messagesToSend = ['1', '2', '3'];
    const results: string[] = [];

    messagesToSend.forEach(msg => logger.log('TEST', msg));
    logger.listen(entry => results.push(entry.message));

    expect(messagesToSend).equalTo(results);
  });
});
