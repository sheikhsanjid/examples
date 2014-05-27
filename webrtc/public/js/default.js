function RTC() {
	this.ws = null;
	this.options = { audio: true, video: true };
	this.recorder = { connection: null, local: [], remote: [], stream: null };
	this.receiver = { connection: null, local: [], remote: [], stream: null };
	this.servers = null;
	this.tmp = [];
	this.isHost = false;
	this.timeout = null;
}

RTC.prototype.init = function(room) {

	var self = this;

	if (self.ws !== null)
		self.ws.close();

	self.ws = new WebSocket('ws://' + window.location.href.replace(window.location.protocol, '') + '?room=' + room);

	self.ws.onmessage = function (e) {

		var obj = JSON.parse(decodeURIComponent(e.data));

		console.log('websocket --->', obj);

		switch (obj.type) {

			case 'start-host':
			case 'start-client':

				self.isHost = obj.type === 'start-host';

				setTimeout(function() {
					self.send();
				}, 2000);

				break;

			case 'sdp':
			case 'candidate':

				// recorder to receiver
				if (obj.from === 'receiver')
					self.recorder.remote.push(obj);
				else
					self.receiver.remote.push(obj);

				clearTimeout(self.timeout);
				self.timeout = setTimeout(function() {
					self.flush();
				}, 2000);

				break;
		}
	};

	return self;
};

RTC.prototype.start = function(room) {

	var self = this;

	self.recorder.connection = new RTCPeerConnection(self.servers);
	self.receiver.connection = new RTCPeerConnection(self.servers);

	self.recorder.connection.onicecandidate = function(e) {
		if (!e.candidate)
			return;
		self.recorder.local.push({ type: 'candidate', from: 'recorder', data: e.candidate });
	};

	self.receiver.connection.onicecandidate = function(e) {
		if (!e.candidate)
			return;
		self.receiver.local.push({ type: 'candidate', from: 'receiver', data: e.candidate });
	};

	self.receiver.connection.onaddstream = function(e) {
		console.log('RECEIVER STREAM');
		self.receiver.stream = e.stream;
		attachMediaStream(vid2, e.stream);
	};

	self.recorder.connection.onaddstream = function(e) {
		console.log('RECORDER STREAM');
		self.receiver.stream = e.stream;
		attachMediaStream(vid2, e.stream);
	};

	getUserMedia(self.options, function(stream) {
		self.recorder.stream = stream;
		self.recorder.connection.addStream(self.recorder.stream);

		self.recorder.connection.createOffer(function(desc) {
			self.recorder.connection.setLocalDescription(desc);
			self.recorder.local.push({ type: 'sdp', from: 'recorder', desc: 'offer', data: desc });
		}, onError, { 'mandatory': { 'OfferToReceiveAudio': self.options.audio, 'OfferToReceiveVideo': self.options.video }});

		attachMediaStream(vid1, stream);
		self.init(room);
	}, noop);

	console.log('START');
	return self;

};

RTC.prototype.send = function(force) {

	var self = this;

	if (!force) {
		self.tmp = self.tmp.concat(self.recorder.local, self.receiver.local);
		self.recorder.local = [];
		self.receiver.local = [];
		self.send(true);
		return;
	}

	var item = self.tmp.shift();

	if (typeof(item) === 'undefined')
		return;

	self.ws.send(encodeURIComponent(JSON.stringify(item)));

	setTimeout(function() {
		self.send(true);
	}, 500);

	return self;
};

RTC.prototype.flush = function() {

	var self = this;

	console.log('FLUSH');

	self.recorder.remote.forEach(function(obj) {

		switch (obj.type) {

			case 'sdp':
				console.log('recorder.connection.setRemoteDescription');
				self.recorder.connection.setRemoteDescription(new RTCSessionDescription(obj.data));
				break;

			case 'candidate':
				// možno hlúposť
				console.log('recorder.connection.addIceCandidate');
				self.recorder.connection.addIceCandidate(new RTCIceCandidate(obj.data), onSuccess, onError);
				break;
		}
	});

	self.receiver.remote.forEach(function(obj) {
		switch (obj.type) {

			case 'sdp':

				console.log('receiver.connection.setRemoteDescription');
				self.receiver.connection.setRemoteDescription(new RTCSessionDescription(obj.data));
				self.receiver.connection.createAnswer(function(desc) {

					console.log('CREATE ANSWER');
					self.receiver.connection.setLocalDescription(desc);
					self.receiver.local.push({ type: 'sdp', from: 'receiver', desc: 'answer', data: desc });

					setTimeout(function() {
						self.send();
					}, 3000);

				}, onError, { 'mandatory': { 'OfferToReceiveAudio': self.options.audio, 'OfferToReceiveVideo': self.options.video }});

				break;

			case 'candidate':
				console.log('receiver.connection.addIceCandidate');
				self.receiver.connection.addIceCandidate(new RTCIceCandidate(obj.data), onSuccess, onError);
				break;
		}
	});

	self.receiver.remote = [];
	self.recorder.remote = [];

	return self;

};

function onSuccess(e) {
	console.log('SUCCESS', e);
}

function onError(e) {
	console.log('ERROR', e);
}

function noop(){}

var rtc = new RTC();
rtc.start('abcdefgh');