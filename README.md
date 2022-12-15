# RabbitMQ Capabilities Exchange Type

## What It Does

This plugin adds an exchange type allowing for routing to consumers
based on required "capabilities" dictated by a message. Think of it
like the routing on your favourite build server when picking a worker.

This covers the use case of passing messages to consumers based on
a list of compatibility options; for example worker queues which
handle different types of messages. It is similar in concept to the
`x-features` exchange which was already created and still exists
[here](https://github.com/senseysensor/rabbitmq-x-features-exchange),
but some of the options and implementation are a little different.

## How It Works

It's pretty similar to the default `headers` exchange, but the roles
are reversed. When you create a binding to the exchange you provide
(as arguments) the capabilities that your consumer offers. Then, when
a message is published, you include headers defining the capabilities
the message requires. The message is then only routed to consumers which
define *all* of the capabilities.

Both in binding arguments and message headers, capabilities are defined
via the `x-capability-*` prefix to avoid clashing with any other options
or values which might exist. The internal matching is extremely basic, so
don't expect it to be optimally performant, but it should be more than
enough for the use cases it targets. To use the exchange, the type is
`x-capabilities`.

There are a couple of options you can provide on the exchange which might
be helpful to know about:

```
x-capabilities-fanout: bool (true)
```

These flags are validated at exchange creation time, and are currently not
able to be overridden inside messages themselves.

## Installation

The [RabbitMQ documentation](https://www.rabbitmq.com/installing-plugins.html)
explains how to install plugins into your server application. Every plugin is
packaged as either a `.ez` file or a plain directory, based on your version
of RabbitMQ. Just build it and drop the output plugin into your server plugins
directory.

You don't need to clone the RabbitMQ umbrella project; just clone
this repository, check out the branch you want (i.e. `v3.8.x`), and run `make`.
If there is no existing branch for your version, just create it from `main`;
RabbitMQ checks this version when pulling and pinning libraries. This plugin
targets RabbitMQ 3.6.0 and later versions.

## Development

This repository includes some Docker setup to make it easier to test the plugin,
and run a server with the plugin installed. Packaging the plugin is pretty simple
using Docker:

```bash
# build a development image with dependencies
$ cat Dockerfile.build | \
    docker build -t plugin_build -f - .

# attach to the container
$ docker run -it --rm \
    -v $PWD:/opt/rabbitmq \
    -w /opt/rabbitmq \
    bash

# build and package
$ make
$ make dist
```

If you want to start a RabbitMQ server with this plugin enabled, you can use
the server Dockerfile to let you run the tests against it:

```bash
# build a development image with dependencies
$ cat Dockerfile.build Dockerfile.service | \
    docker build -t plugin_build -f - .

# start running to the container
$ docker run -it --rm \
    -p 15672:15672 \
    -p 5672:5672 \
    bash

# test the plugin
$ npm test
```

There are other ways to embed your workflow into the main server tree, but this
seemed complicated for how simple this plugin is, so the above worked for me.
