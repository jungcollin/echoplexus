if (typeof DEBUG === 'undefined') DEBUG = true; // will be removed

function SyncedEditor () {
	var SyncedEditorView = Backbone.View.extend({
		class: "syncedEditor",

		initialize: function (opts) {
			var self = this;

			_.bindAll(this);
			if (!opts.hasOwnProperty("editor")) {
				throw "There was no editor supplied to SyncedEditor";
			}
			if (!opts.hasOwnProperty("room")) {
				throw "There was no room supplied to SyncedEditor";
			}

			this.editor = opts.editor;
			this.channelName = opts.room;
			this.subchannelName = opts.subchannel;
			this.channelKey = this.channelName + ":" + this.subchannelName;
			this.socket = io.connect("/code");

			this.active = false;
			this.listen();
			this.attachEvents();

			this.users = new ClientsCollection();
			this.users.model = ClientModel;

			// initialize the channel
			this.socket.emit("subscribe", {
				room: this.channelName,
				subchannel: this.subchannelName
			});

			this.on("show", function () {
				DEBUG && console.log("synced_editor:show");
				self.active = true;
				if (self.editor) {
					self.editor.refresh();
				}
			});

			this.on("hide", function () {
				DEBUG && console.log("synced_editor:hide");
				self.active = false;
				$(".ghost-cursor").remove();
			});

			$("body").on("codeSectionActive", function () { // sloppy, forgive me
				self.trigger("eval");
			});
		},

		kill: function () {
			var self = this;

			DEBUG && console.log("killing SyncedEditorView");

			_.each(this.socketEvents, function (method, key) {
				self.socket.removeAllListeners(key + ":" + self.channelKey);
			});
			this.socket.emit("unsubscribe:" + this.channelKey, {
				room: this.channelName
			});
		},

		attachEvents: function () {
			var self = this,
				socket = this.socket;
				
			this.editor.on("change", function (instance, change) {
				if (change.origin !== undefined && change.origin !== "setValue") {
					socket.emit("code:change:" + self.channelKey, change);
				}
				if (codingModeActive()) {
					self.trigger("eval");
				}
			});
			this.editor.on("cursorActivity", function (instance) {
				if (!self.active ||
					!codingModeActive() ) {

					return;	 // don't report cursor events if we aren't looking at the document
				}
				socket.emit("code:cursorActivity:" + self.channelKey, {
					cursor: instance.getCursor()
				});
			});
		},

		listen: function () {
			var self = this,
				editor = this.editor,
				socket = this.socket;

			this.socketEvents = {
				"code:change": function (change) {
					// received a change from another client, update our view
					self.applyChanges(change);
				},
				"code:request": function () {
					// received a transcript request from server, it thinks we're authority
					// send a copy of the entirety of our code
					socket.emit("code:full_transcript:" + self.channelKey, {
						code: editor.getValue()
					});
				},
				"code:sync": function (data) {
					// hard reset / overwrite our code with the value from the server
					if (editor.getValue() !== data.code) {
						editor.setValue(data.code);
					}
				},
				"code:authoritative_push": function (data) {
					// received a batch of changes and a starting value to apply those changes to
					editor.setValue(data.start);
					for (var i = 0; i < data.ops.length; i ++) {
						self.applyChanges(data.ops[i]);
					}
				},
				"code:cursorActivity": function (data) {
					// show the other users' cursors in our view
					if (!self.active || !codingModeActive()) {
						return;
					}
					var pos = editor.charCoords(data.cursor); // their position
					var fromClient = self.users.where({cid: data.cid}); // this might seem liek some crazy shit, but we're using the server's cid as our ID, and ignoring our local cid
					if (fromClient.length > 0) {
						fromClient = fromClient[0];
					} else {
						return;
					}

					// try to find an existing ghost cursor:
					var $ghostCursor = $(".ghost-cursor[rel='" + data.cid + "']"); // NOT SCOPED: it's appended and positioned absolutely in the body!
					if (!$ghostCursor.length) { // if non-existent, create one
						$ghostCursor = $("<div class='ghost-cursor' rel=" + data.cid +"></div>");
						$("body").append($ghostCursor); // it's absolutely positioned wrt body

						$ghostCursor.append("<div class='user'>"+ fromClient.get("nick") +"</div>");
					}

					var clientColor = fromClient.get("color").toRGB();

					$ghostCursor.css({
						background: clientColor,
						color: clientColor,
						top: pos.top,
						left: pos.left
					});
				},
				"userlist": function (data) {
					self.users.set(data.users);
					DEBUG && console.log("USERS", self.users);
				}
			};

			_.each(this.socketEvents, function (value, key) {
				socket.on(key + ":" + self.channelKey, value);
			});
		},

		applyChanges: function (change) {
			var editor = this.editor;
			
			editor.replaceRange(change.text, change.from, change.to);
			while (change.next !== undefined) { // apply all the changes we receive until there are no more
				change = change.next;
				editor.replaceRange(change.text, change.from, change.to);
			}
		}
	});

	return SyncedEditorView;
}