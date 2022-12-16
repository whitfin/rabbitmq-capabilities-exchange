const amqp = require('amqplib');
const should = require('should');
const timers = require('timers/promises');

let _connection;
let _cleanupTasks = [];

suite('RabbitMQ Capabilities Exchange', function () {

    suiteSetup('start connection', async function () {
        _connection = await amqp.connect(
            process.env.CLUSTER_URI
        );

        _scheduleForCleanup(async function () {
            await _connection.close();
        });
    });

    test('creating an x-capabilities exchange', async function () {
        let { name, channel } = await _createExchange();
    });

    test('routing to a single consumer with required capabilities', async function () {
        return _testMessageRouting(
            {
                'x-capabilities-fanout': false
            },
            {
                'something-1': 'one',
                'something-2': 'two',
                'x-capability-foo': 'bar',
                'x-capability-type': 'baz',
                'zomething-1': 'one'
            },
            {
                'something-3': 'three',
                'x-capability-type': 'baz',
                'x-capability-foo': 'bar',
                'zomething-2': 'two'
            },
            1
        );
    });

    test('routing to a single consumer with more than required capabilities', async function () {
        return _testMessageRouting(
            {
                'x-capabilities-fanout': false
            },
            {
                'x-capability-foo': 'bar'
            },
            {
                'x-capability-foo': 'bar',
                'x-capability-type': 'baz'
            },
            1
        );
    });

    test('routing to a single consumer with less than required capabilities', async function () {
        return _testMessageRouting(
            {
                'x-capabilities-fanout': false
            },
            {
                'x-capability-foo': 'bar',
                'x-capability-type': 'baz'
            },
            {
                'x-capability-foo': 'bar'
            },
            0
        );
    });

    test('routing to a single consumer with no provided capabilities', async function () {
        return _testMessageRouting(
            {
                'x-capabilities-fanout': false
            },
            {
                'x-capability-foo': 'bar',
                'x-capability-type': 'baz'
            },
            {
                // nothing provided!
            },
            0
        );
    });

    test('routing to multiple consumers with required capabilities', async function () {
        return _testMessageRouting(
            {
                'x-capabilities-fanout': true
            },
            {
                'something-1': 'one',
                'something-2': 'two',
                'x-capability-foo': 'bar',
                'x-capability-type': 'baz',
                'zomething-1': 'one'
            },
            {
                'something-3': 'three',
                'x-capability-type': 'baz',
                'x-capability-foo': 'bar',
                'zomething-2': 'two'
            },
            2
        );
    });

    test('routing to multiple consumers with more than required capabilities', async function () {
        return _testMessageRouting(
            {
                'x-capabilities-fanout': true
            },
            {
                'x-capability-foo': 'bar'
            },
            {
                'x-capability-foo': 'bar',
                'x-capability-type': 'baz'
            },
            2
        );
    });

    test('routing to multiple consumers with less than required capabilities', async function () {
        return _testMessageRouting(
            {
                'x-capabilities-fanout': true
            },
            {
                'x-capability-foo': 'bar',
                'x-capability-type': 'baz'
            },
            {
                'x-capability-foo': 'bar'
            },
            0
        );
    });

    test('routing to multiple consumers with no provided capabilities', async function () {
        return _testMessageRouting(
            {
                'x-capabilities-fanout': true
            },
            {
                'x-capability-foo': 'bar',
                'x-capability-type': 'baz'
            },
            {
                // nothing provided!
            },
            0
        );
    });

    test('routing to multiple consumers by default', async function () {
        return _testMessageRouting(
            { },
            {
                'x-capability-foo': 'bar'
            },
            {
                'x-capability-foo': 'bar'
            },
            2
        );
    });

    suiteTeardown('close connection', async function () {
        for (let task of _cleanupTasks) {
            await task();
        }
    });
});

/* Private helpers */

async function _bindQueue(channel, queue, exchange, capabilities) {
    await channel.bindQueue(queue, exchange, '', capabilities);
}

async function _createExchange(args) {
    let channel = await _connection.createChannel();

    _scheduleForCleanup(async function () {
        await channel.close();
    });

    let name = _name();
    let result = await channel.assertExchange(name, 'x-capabilities', {
        arguments: args
    });

    should(result).be.an.Object();
    should(result).have.property('exchange');
    should(result.exchange).eql(name);

    _scheduleForCleanup(async function () {
        return channel.deleteExchange(name, {});
    });

    return { name, channel };
}

async function _createQueue(channel, queue) {
    let result = await channel.assertQueue(queue, { durable: false });

    should(result).be.an.Object();
    should(result).have.property('queue');
    should(result.queue).eql(queue);
}

async function _consume(channel, queue, validator, exit) {
    return new Promise(function (resolve, reject) {
        channel
            .consume(queue, function (message) {
                validator(message);
                resolve();
            }, {})
            .then(function (result) {
                try {
                    should(result).be.an.Object();
                    should(result).have.property('consumerTag');
                } catch (err) {
                    reject(err);
                }
                exit && resolve();
            })
            .catch(function (err) {
                reject(err);
            });
    });
}

function _name() {
    return Math.random().toString(36).substring(7);
}

function _scheduleForCleanup(task) {
    _cleanupTasks.unshift(task);
}

async function _testMessageRouting(args, required, provided, expected) {
    let { name, channel } = await _createExchange(args);

    let exchange = name;
    let message_bytes = Buffer.from(_name());
    let received_messages = 0;

    async function _listen(queue) {
        await _createQueue(channel, queue);
        await _bindQueue(channel, queue, exchange, provided);
        _consume(channel, queue, function (message) {
            should(message.content).eql(message_bytes);
            received_messages += 1;
        });
    };

    await _listen(_name());
    await _listen(_name());

    await channel.publish(exchange, '', message_bytes, {
        headers: required
    });

    await timers.setTimeout(500);

    should(received_messages).eql(expected);
}
