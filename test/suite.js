const amqp = require('amqplib');
const should = require('should');

let _connection;
let _cleanupTasks = [];

suite('RabbitMQ capabilities Exchange', function () {

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


    test('consumers with all required capabilities', async function () {
        let { name, channel } = await _createExchange();

        let exchange = name;
        let queue_name = _name();
        let message_bytes = Buffer.from(_name());

        let capabilities = {
            'x-capability-foo': 'bar',
            'x-capability-type': 'baz'
        };

        await _createQueue(channel, queue_name);

        await _bindQueue(channel, queue_name, exchange, {
            'something-3': 'three',
            'x-capability-type': 'baz',
            'x-capability-foo': 'bar',
            'zomething-2': 'two',
        });

        await _publish(channel, exchange, message_bytes, {
            'something-1': 'one',
            'something-2': 'two',
            'x-capability-foo': 'bar',
            'x-capability-type': 'baz',
            'zomething-1': 'one',
        });

        await _consume(channel, queue_name, function validate(message) {
            should(message.content).eql(message_bytes);
        });
    });

    test('consumers with all required capabilities and extras', async function () {
        let { name, channel } = await _createExchange();

        let exchange = name;
        let queue_name = _name();
        let message_bytes = Buffer.from(_name());

        await _createQueue(channel, queue_name);

        await _bindQueue(channel, queue_name, exchange, {
            'x-capability-foo': 'bar',
            'x-capability-type': 'baz',
            'x-capability-bonus': 'yo'
        });

        await _publish(channel, exchange, message_bytes, {
            'x-capability-foo': 'bar',
            'x-capability-type': 'baz'
        });

        await _consume(channel, queue_name, function validate(message) {
            should(message.content).eql(message_bytes);
        });
    });

    test('consumers with missing capabilities', async function () {
        let { name, channel } = await _createExchange();

        let exchange = name;
        let queue_name = _name();
        let message_bytes = Buffer.from(_name());

        await _createQueue(channel, queue_name);

        await _bindQueue(channel, queue_name, exchange, {
            'x-capability-foo': 'bar',
            'x-capability-type': 'bar'
        });

        await _publish(channel, exchange, message_bytes, {
            'x-capability-foo': 'bar',
            'x-capability-type': 'baz'
        });

        await _consume(channel, queue_name, function validate() {
            should.fail('Message should never be received!');
        }, true);
    });

    test('consumers with no provided capabilities', async function () {
        let { name, channel } = await _createExchange();

        let exchange = name;
        let queue_name = _name();
        let message_bytes = Buffer.from(_name());

        await _createQueue(channel, queue_name);

        await _bindQueue(channel, queue_name, exchange, {
            'x-capability-foo': 'bar',
            'x-capability-type': 'baz'
        });

        await _publish(channel, exchange, message_bytes, {
            // no capabilities
        });

        await _consume(channel, queue_name, function validate(message) {
            should(message.content).eql(message_bytes);
        });
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

async function _createExchange() {
    let channel = await _connection.createChannel();

    _scheduleForCleanup(async function () {
        await channel.close();
    });

    let name = _name();
    let result = await channel.assertExchange(name, 'x-capabilities', {});

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

async function _publish(channel, exchange, message, capabilities) {
    await channel.publish(exchange, '', message, {
        headers: capabilities
    });
}

function _name() {
    return Math.random().toString(36).substring(7);
}

function _scheduleForCleanup(task) {
    _cleanupTasks.unshift(task);
}
