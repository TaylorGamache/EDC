var port = (process.env.VCAP_APP_PORT || 3000);
var host = (process.env.VCAP_APP_HOST || 'localhost');
var bodyParser = require("body-parser");
var express = require('express');
var request = require('request');
var Cloudant = require('cloudant');
var Config = require('config-js');
var json = require('json');
var config = new Config('./email_digest_config.js');
var sendAPI = config.get('SENDGRID_KEY');
var sendGrid = require('sendgrid')(sendAPI);
var me = config.get('CLOUDANT_USERNAME');
var password = config.get('CLOUDANT_PW');
var app = express();
var cloudant = Cloudant({account:me, password:password});

var db = cloudant.db.use('email_digest');
var Q = [];

app.use(bodyParser.json());
// app.use(express.json());
app.use(express.static(__dirname + '/public'));

/******

INIT

******/

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
		var email = {'to':result.docs[i].To, 'from': 'Email@Digest.Test', 
					'subject': result.docs[i].Subject,'text':result.docs[i].Body};
		var eQue = {'id':result.docs[i]._id, 'Timer':result.docs[i].timer, 'Email':email  };
		Q.push(eQue);
		
	}
	console.log('Email Digest Channel is up and running.');
});

/***********************************

ADD NEW OR UPDATE A RECIPE IN QUEUE

***********************************/
		
//Endpoint for adding or changing emails in queue
app.post('/api/v1/emailDigest', function(req, res){
	//console.log(req.headers.recipeid);
	var ID = req.headers.recipeid;
	var to = req.headers.destination;
	var msg = req.headers.msg;
	var sub = req.headers.subject;
	var aggr = req.headers.aggregation;
	
	//Makes sure data in JSON is formatted and submitted correctly.
	if(to == "") {
		res.json({success: false, msg: 'No email to send to were submitted.'});
	} else if (ID == "") {
		res.json({success: false, msg: 'No recipeID was submitted.'});
	} else if (request.timer == "day" || request.timer == "week" || request.timer == "month") {
		res.json({success: false, msg: 'Incorrect timer type was submitted.'});
	}  else {
		res.json({success: true, msg: 'Email was submitted.'});
		//Check if the ID exists and if it does update it
		var tempQ = [];
		var check = true;
		var exists = false; 
		while (check) {
			var item = Q.pop();
			if (item == null ) {
				check = false;
			} else  {
				if (item.id == ID) {
					console.log(item);
					console.log("Replaced the above queued message with the submitted message...");
					exists = true;
					item.Timer = aggr;
					item.Email.to = to;
					item.Email.subject = sub;
					item.Email.text = msg;
				}
				tempQ.push(item);
				
			}
		}
		//reset Q
		Q = tempQ;
		// If ID was not in queue than add it
		if (exists == false) {
			console.log("ID not in queue. Added as new message in queue.");
			var email = {'to':to, 'from': 'Email@Digest.Test', 
						'subject': sub,'text':msg};

			var eQue = {'id':ID, 'Timer':aggr, 'Email':email  };
			Q.push(eQue);
		} 		
	}
});

/******************

Temperary Endpoints

******************/

//Endpoint for adding emails to database (Temperary)
app.post('/api/v1/temp/new', function(req, res){
	var request = req.body;
	request.timer.callbackURL = "";
	//request.timer.recipeID = "";
	
	//Makes sure data in JSON is formatted and submitted correctly.
	if(request.To == "") {
		res.json({success: false, msg: 'No email to send to were submitted.'});
	} else if (request.callback == "") {
		res.json({success: false, msg: 'No callback was submitted.'});
	} else if (request.timer != "day" && request.timer != "week" && request.timer != "month") {
		res.json({success: false, msg: 'Incorrect timer type was submitted.'});
	}  else {
		
		//Insert new Email Digest Action into database
		db.insert(request, function(err, body, header){
			if(err){
				res.json({success:false, msg:'Error adding Email Digest action.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the Email action to database.'});
				
				console.log('New Email Added to Database');
				var email = {'to':request.To, 'from': 'Email@Digest.Test', 
							'subject': request.Subject,'text':request.Body};
				
				var eQue = {'id':request._id, 'Timer':request.timer, 'Email':email  };
				Q.push(eQue);			
			}
		});
	}
});

//Sends email

app.post('/api/v1/temp/send/:recipeid', function(req, res){
	var ID = req.params.recipeid;
	var e;
	var check = true;
	var tempQ = Q;
	while (check) {
		var item = tempQ.pop();
		
		if (item == null ) {
			check = false;
			res.json({success: false, msg: 'Failed to find matching recipeID.'});
		} else {
			
			if (item.id == ID) {
				check = false;
				e = item.Email;
			}
		}
	}
	
	sendGrid.send(e, function(err, json) {
	if (err) { 
		res.json({success: false, msg: 'Failed to send Email.'});
	}
		res.json({success: true, msg: 'Successfully sent email.'});
	});
	
});



app.listen(port);

