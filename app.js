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

/*For sending out emails
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
		});*/
		
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
	} else if (request.timer.trigger.timezone == "") {
		res.json({success: false, msg: 'No timezone was submitted.'});
	} else if (request.timer.trigger.hour > 23 || request.time.hour < 0) {
		res.json({success: false, msg: 'Incorrect formatted hour was submitted.'});
	} else if (request.timer.trigger.min > 59 || request.time.min < 0) {
		res.json({success: false, msg: 'Incorrect formatted min was submitted.'});
	} else if (request.timer.trigger.days >6 || request.time.days < 0) {
		res.json({success: false, msg: 'Incorrect formatted days was submitted.'});
	} else if (request.timer.trigger.date > 31 || request.time.date < 0) {
		res.json({success: false, msg: 'Incorrect formatted date was submitted.'});
	} else if (request.timer.trigger.month > 12 || request.time.month < 1) {
		res.json({success: false, msg: 'Incorrect formatted month was submitted.'});
	} else {
		
		//Insert new Email Digest Action into database
		db.insert(request, function(err, body, header){
			if(err){
				res.json({success:false, msg:'Error adding Email Digest action.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the Email action to database.'});
				
				console.log('New Email Added to Database');
				//Add a timer
				request(requestURL, function(err, response, body){
					if(!err){
						console.log("successful response from Timer API!");
						var parsedbody = JSON.parse(body);
						var changePercent = parsedbody.ChangePercent;
					}
				});
				
			}
		});
	}
});
 
//Function for sending email in queue
exports.send = function(from, to, subject, body, callback) {

};




app.listen(port);

