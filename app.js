var port = (process.env.VCAP_APP_PORT || 3000);
var host = (process.env.VCAP_APP_HOST || 'localhost');
var bodyParser = require("body-parser");
var express = require('express');
var request = require('request');
var Cloudant = require('cloudant');
var Config = require('config-js');
var json = require('json');
const fs = require('fs');
var config = new Config('./email_digest_config.js');
var sendAPI = config.get('SENDGRID_KEY');
var sendGrid = require('sendgrid')(sendAPI);
var me = config.get('CLOUDANT_USERNAME');
var password = config.get('CLOUDANT_PW');
var app = express();
var cloudant = Cloudant({account:me, password:password});
var cron = require('cron');

var db = cloudant.db.use('email_digest');

/******

INIT

******/

app.use(bodyParser.json());
// app.use(express.json());
app.use(express.static(__dirname + '/public'));

console.log('Email Digest Channel is up and running.');

/*************************

PROCESS OF SENDING EMAILS

*************************/

//Gets all Emails out of the database and puts them in a queue at 12 am for sending
// Runs every day at 12 am
//var cronJob = cron.job("0 0 0 */1 * *", function(){
var cronJob = cron.job("0 */1 * * * *", function(){
	var allDocs = {"selector": { "_id": { "$gt": 0}}};
	db.find(allDocs ,function(err, result){
		var eMsg;
		if (err) {
			eMsg = "Failed to access the database. \n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {
			
			});
		} 
		for (var i = 0; i < result.docs.length; i++) {
			if (result.docs[i].relation == "emailDigest") {
				
				//get todays info
				var tod = new Date();
				var d = tod.getDay();  //Day of week sunday=0
				var m = tod.getDate(); //Day of the month

				if (result.docs[i].action.timer == "day") {
					sendEmail(result.docs[i]);
				} else if (result.docs[i].action.timer == "week" && d == 1) {
					sendEmail(result.docs[i]);
				} else if (result.docs[i].action.timer == "month" && m == 1) {
					sendEmail(result.docs[i]);
				}
					
			}
		
		}
	});
});
cronJob.start();

/***********************************

ADD NEW OR UPDATE A RECIPE IN QUEUE

***********************************/
		
//Endpoint for adding or changing emails in queue and database
app.post('/api/v1/emailDigest', function(req, res){
	//console.log(req.body);
	var ID = req.body.recipeid;
	var to = req.body.to;
	var msg = req.body.msg;
	var sub = req.body.subject;
	var aggr = req.body.aggregation;
	
	//Makes sure data in JSON is formatted and submitted correctly.
	if(to == "") {
		res.json({success: false, msg: 'No email to send to were submitted.'});
	} /*else if (ID == "") {
		res.json({success: false, msg: 'No recipeID was submitted.'});
	}*/ else if (request.timer == "day" || request.timer == "week" || request.timer == "month") {
		res.json({success: false, msg: 'Incorrect timer type was submitted.'});
	}  else {
		var td = new Date();
		var dd = td.getDate();
		var mm = td.getMonth()+1;
		var tot = dd + mm;
		var actionJSON = {'To':to , 'Subject':sub , 'Body':msg , 'timer':aggr};
		var recipeJSON = { 'relation':'emailDigest', 'lastUpdate':tot, 'lastSent':0, 'action': actionJSON};
		//updateQ(recipeJSON);
		// replace email digest recipe in database
		if (ID !="") {
			db.insert(recipeJSON, recipeJSON.recipeID, function(err, body, header){
				if(err){
					res.json({success: true, msg: 'Failed to update the email in database...please try again.'});
				} else {
					res.json({success: true, msg: 'Email was submitted.'});
				}
			});
		} else {
			db.insert(recipeJSON, function(err, body, header){
				if(err){
					res.json({success: true, msg: 'Failed to store email in database...please try again.'});
				} else {
					res.json({success: true, msg: 'Email was submitted.'});
				}
			});
		}
		
	}
});

/******************

    FUNCTIONS

******************/

//Sends emails in queue if lastUpdate is not equal
function sendEmail(recipe) {
	var eMsg;
	//get ID
	var ID = recipe._id;
	//get date for reference
	var today = new Date();
	var da = today.getDate();
	var mon = today.getMonth()+1;
	var total = mon + da;
	db.get(ID, function(err, data){
		if(err){
			eMsg = "Failed to access the database for recipe _id=" + ID + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
		} else if (data.lastSent != total) {
			data.lastSent = total;
			//update last update date
			db.insert(data, data._id, function(err, body, header){
				if(err){
					eMsg = "Failed to access the database for recipe _id=" + ID + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else if (data.lastUpdate == recipe.lastUpdate){
					//if the queues version is the most updated
					var theQ = formQueue(recipe);
					gridSend(theQ);
				} else {
					//for if it has been updated recently
					var updatedQ = formQueue(data);
					gridSend(updatedQ);
				}
			});
		}
	});
	
}

//returns a queue for one recipeID
function formQueue (emailRec) {
	var ea = emailRec.action.To.replace(" ","");
	var eAddress = ea.split(",");
	var size = eAddress.length;
	var thisQ = [];
	var j = 0;
	
	while (j < size) {
		if (eAddress[j] != ""){
			var email = {'to':eAddress[j], 'from': 'Email@Digest.Test', 
						'subject': emailRec.action.Subject,'text':emailRec.action.Body};
			var eQue = {'recipeID':emailRec._id , 'Timer':emailRec.action.timer, 'lastUpdate':emailRec.lastUpdate, 'Email':email  };
			thisQ.push(eQue);
		}
		j++;
	}
	return thisQ;
}

//uses send grid to send emails in Queue q
function gridSend(q) {
	var eMsg;
	var check = true;
	while (check) {
		var item = q.pop();
		//console.log(item);
		if (item == null ) {
			check = false;
		} else {
			sendGrid.send(item.Email, function(err, json) {
				if (err) { 
					eMsg = "Failed to send email for recipe ID =" +item.recipeID +" \n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {
			
					});
				} 
			});
		}
	}
}

/******************

Temperary Endpoints

******************/

//if in use than loop until not in use
/*function updateQ(newJSON){
	if (inUse) {
		//waits for 1 seconds before it checks again
		setTimeout(updateQ(newJSON), 1000);
	} else {
		inUse = true;
		//Check if the ID exists and if it does update it
		var tempQ = [];
		var tempQ2 = Q;
		var check = true;
		var exists = false; 
		while (check) {
			var item = tempQ2.pop();
			if (item == null ) {
				check = false;
			} else  {
				var firstItem = item.pop();
				if (firstItem.recipeID == newJSON.recipeID) {
					//update newJSON's id field
					newJSON.id = firstItem.id;
					//now update queue
					console.log("Updating queue and database with the submitted message...");
					exists = true;
					var ea = newJSON.action.To.replace(" ","");
					var eAddress = ea.split(",");
					var size = eAddress.length;
					var thisQ = [];
					var j = 0;
					while (j < size) {
						var email = {'to':eAddress[j], 'from': 'Email@Digest.Test', 
									'subject': newJSON.action.Subject,'text':newJSON.action.Body};
						var eQue = {'id':firstItem.id, 'recipeID':newJSON.recipeID , 'Timer':newJSON.timer, 'Email':email  };
						thisQ.push(eQue);
						j++;
					}
					tempQ.push(thisQ);
				} else {
					tempQ.push(item);
				}
				
			}
		}
		// If ID was not in queue than add it
		if (exists == false) {
			// add email digest recipe in database
			db.insert(newJSON, function(err, body, header){
				if(err){
					eMsg = "Failed to add email recipe to database. \n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else {
					//it doesnt exist in queue so add it to Q
					console.log("ID not in queue. Added as new message in queue.");
					var ea = newJSON.action.To.replace(" ","");
					var eAddress = ea.split(",");
					var size = eAddress.length;
					var thisQ = [];
					var j = 0;
					while (j < size) {
						var email = {'to':eAddress[j], 'from': 'Email@Digest.Test', 
									'subject': newJSON.action.Subject,'text':newJSON.action.Body};
						var eQue = {'id':body.id, 'recipeID':newJSON.recipeID , 'Timer':newJSON.timer, 'Email':email  };
						thisQ.push(eQue);
						j++;
					}
					Q.push(thisQ);
				}
			});
		} else {
			// update Q with new Q
			//Q = tempQ;
			// replace email digest recipe in database
			db.insert(newJSON, newJSON.id, function(err, body, header){
				if(err){
					eMsg = "Failed to update database for recipe _id=" + newJSON.id + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				}
			});
		}
	}
}*/



app.listen(port);

