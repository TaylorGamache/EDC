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

//For sending out emails
//Gets all Emails out of the database and puts them in a queue at startup
var allDocs = {"selector": { "_id": { "$gt": 0}}};
db.find(allDocs ,function(err, result){
	if (err) {
		throw err;
	} 
	console.log('Found %d Email JSONs at startup.', result.docs.length);
	for (var i = 0; i < result.docs.length; i++) {
		//console.log('Email Number: %d', (i+1));
		//console.log('Email Subject: %s', result.docs[i].Subject);
		//console.log('Email Body: %s', result.docs[i].Body);
		Q.push(result.docs[i]);
	}
	console.log('Email Digest Channel is up and running.');
});
		
app.delete('/api/v1/emailDigest/:recipeid', function(req, res){
	var del_ID = req.params.recipeid;
	
	db.get(del_ID, function(err, data){
		if(err){
			res.json({success: false, msg: 'Failed to find the Email Digest Action in the database, please try again.'});
		} else {
			var rev = data._rev;
			db.destroy(del_ID, rev,  function(err) {
				if (!err) {
					res.json({success: true, msg: 'Successfully deleted the Email Digest Action from the database.'});
					console.log("Successfully deleted doc"+ del_ID);
				} else {
					res.json({success: false, msg: 'Failed to delete the Email Digest Action from the database, please try again.'});
					//console.log("failed");
				}
			});
		}
	});
});	

//Endpoint for adding emails to database
app.post('/api/v1/emailDigest/new', function(req, res){
	var request = req.body;
	request.timer.callbackURL = "";
	//request.timer.recipeID = "";
	
	//Makes sure data in JSON is formatted and submitted correctly.
	if(request.To == "") {
		res.json({success: false, msg: 'No email to send to were submitted.'});
	} else if (request.callback == "") {
		res.json({success: false, msg: 'No callback was submitted.'});
	} else if (request.timer == "day" || request.timer == "week" || request.timer == "month") {
		res.json({success: false, msg: 'Incorrect timer type was submitted.'});
	}  else {
		//Start setting up the Timer recipe
		var trig = {
			"recipeID": "string",
			"callbackURL": "string",
			"trigger": {
				"repeat": 0,
				"hour": 23,
				"min": 59,
				"interval": 0,
				"days": 0,
				"date": 1,
				"month": 1,
				"timezone": "America/New_York"
			}
		};
		if (request.timer == "day") {
			
		} else if (request.timer == "week") {
			
		} else {
			
		}
		
		//Insert new Email Digest Action into database
		db.insert(request, function(err, body, header){
			if(err){
				res.json({success:false, msg:'Error adding Email Digest action.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the Email action to database.'});
				
				console.log('New Email Added to Database');
				//Add a timer
				//Have not actually set up yet
				request(requestURL, function(err, response, body){
					if(!err){
						console.log("successful response from Timer API!");
						var parsedbody = JSON.parse(body);
					}
				});
				
			}
		});
	}
});

//I think we need another endpoint for sending emails but they say we do not
 
//Function for sending email in queue
//I am not really sure how it works yet, I copied and pasted from what they gave us
exports.send = function(from, to, subject, body, callback) {
	
  var formData = {
    sendTo: to,
    from: from,
    subject: subject,
    html: body,
    applicationKey: settings.connect2mail.appKey
  };

  var jsonData = {
    method: 'POST',
    headers: {},
    url: settings.connect2mail.endpoint,
    data: formData
  };

  httpQueue.create(jsonData, function() {
    callback(null, true);
    return;
  });

};




app.listen(port);

