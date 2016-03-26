var port = (process.env.VCAP_APP_PORT || 3000);
var host = (process.env.VCAP_APP_HOST || 'localhost');
var bodyParser = require("body-parser");
var express = require('express');
var request = require('request');
var Cloudant = require('cloudant');
var Config = require('config-js');
var json = require('json');
var config = new Config('./email_digest_config.js');
var me = config.get('CLOUDANT_USERNAME');
var password = config.get('CLOUDANT_PW');
var weatherAPIKey = config.get('API_KEY');
var triggerCallback = "http://nsds-api-stage.mybluemix.net/api/v1/trigger/";
//var httpQueue = require('./http_queue');

var app = express();

var cloudant = Cloudant({account:me, password:password});

// lists all the databases on console

cloudant.db.list(function(err, allDbs){
	console.log("my dbs: %s", allDbs.join(','))
});


var db = cloudant.db.use('email_digest');
var Q = [];

app.use(bodyParser.json());
// app.use(express.json());
app.use(express.static(__dirname + '/public'));
/*
//Used to find all indexes of db
db.index(function(er, result) {
  if (er) {
    throw er;
  }

  console.log('The database has %d indexes', result.indexes.length);
  for (var i = 0; i < result.indexes.length; i++) {
    console.log('  %s (%s): %j', result.indexes[i].name, result.indexes[i].type, result.indexes[i].def);
  }
});
*/

//Gets all Emails out of the database and puts them in a queue at startup
var allDocs = {"selector": { "_id": { "$gt": 0}}};
db.find(allDocs ,function(err, result){
	if (err) {
		throw err;
	} 
	console.log('Found %d Email JSONs at startup.', result.docs.length);
    for (var i = 0; i < result.docs.length; i++) {
		console.log('Email Number: %d', (i+1));
		console.log('Email Subject: %s', result.docs[i].Subject);
		console.log('Email Body: %s', result.docs[i].Body);
		Q.push(result.docs[i]);
    }
});

//Endpoint for adding emails to database and queue
app.post('/api/v1/emailDigest/queue', function(req, res){
	var request = req.body;
	
	if(request.To == "") {
		res.json({success: false, msg: 'No emails to send to were submitted.'});
	} else if (request.Subject == "") {
		res.json({success: false, msg: 'No subject was submitted.'});
	} else if (request.Body == "") {
		res.json({success: false, msg: 'No email body was submitted.'});
	} else if (request.callback == "") {
		res.json({success: false, msg: 'No callback was submitted.'});
	} else {

		db.insert(request, function(err, body, header){
			if(err){
				res.json({success:false, msg:'Error adding Email action.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the Email action to database.'});
				
				//Add email to queue
				Q.push(request);
			}
		});
	}
});
 
//Function for sending email in queue
exports.send = function(from, to, subject, body, callback) {

};




app.listen(port);

