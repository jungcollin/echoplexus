_                = require('underscore')
ApplicationError = require("./Error.js.coffee")
AbstractServer   = require('./AbstractServer.coffee').AbstractServer
Client           = require('../client/client.js').ClientModel
Clients          = require('../client/client.js').ClientsCollection
config           = require('./config.coffee').Configuration
DEBUG            = config.DEBUG

module.exports.DrawServer = class DrawingServer extends AbstractServer

	name: "DrawServer"
	namespace: "/draw"

	subscribeError: (err, socket, channel, client) ->
    if err and err instanceof ApplicationError.AuthenticationError
      console.log("DrawServer: ", err)
	subscribeSuccess: (effectiveRoom, socket, channel, client) ->
		room = channel.get("name")

		# play back what has happened
		socket.emit("draw:replay:#{room}", channel.replay)

	events:
		"draw:line": (namespace, socket, channel, client, data) ->
			room = channel.get("name")

			channel.replay.push(data)

			socket.in(room).broadcast.emit "draw:line:#{room}", (_.extend data, id: client.get("id"))

		"trash": (namespace, socket, channel, client, data) ->
			room = channel.get("name")

			channel.replay = []
			socket.in(room).broadcast.emit "trash:#{room}", data
