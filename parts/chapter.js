'use strict';

var scrap = require("./scrap");
var path = require("path");
var promisify = require("es6-promisify");
var stringify = require('json-stable-stringify');
var fs = require('fs-extra');
var ensureDir = promisify(fs.mkdirs);
var writeFile = promisify(fs.writeFile);
var readFile = promisify(fs.readFile);
const uuidV4 = require('uuid/v4');
var git = require("../git/git");

var Chapter = function(chapterName, authorName, uuid, scraps) {
  this.name = chapterName;
  this.author = authorName;
  this.head = undefined;
  this.isNew = true;
  if (uuid === undefined) {
    this.uuid = uuidV4();
  } else {
    this.uuid = uuid;
  }
  if (scraps === undefined) {
    this.scraps = [];
  } else {
    this.scraps = scraps;
  }
}

Chapter.prototype.getText = async function() {
  var runningText = "\\newpage\n\\section{" + this.name + "}\n\n";
  for (let s of this.scraps) {
    let ns = await scrap.reconstitute(s[0], s[1]);
    runningText = runningText + ns.getText() + "\n\\newline\n";
  }
  return runningText;
}

Chapter.prototype.addScrap = function(scrap, sha) {
  if (sha == undefined) {
    sha = scrap.head
  }
  this.scraps.push([scrap.author, scrap.uuid, sha]);
};

Chapter.prototype.removeScrap = function(scrap) {
  var index = this.scraps.indexOf(scrap);
  this.scraps.splice(index, 1);
};

Chapter.prototype.setScraps = function(scraps) {
  this.scraps = scraps;
};

Chapter.prototype.previousVersions = function(numVersions) {
  return git.getParents(global.storage + this.author + '/chapter/' + this.uuid);
  // return list of previous versions as a [[hash, commit message], ...]
}

Chapter.prototype.save = function(reason) {
  // save new version with commit message `reason`
  var u = {};
  u.email = "test@test.com";
  u.username = this.author;
  var commitMessage = reason;
  var dir = global.storage + u.username + '/chapter/' + this.uuid;

  var chapter = this;

  // TODO sane place to chapter chapters
  dir = path.resolve(process.env.PWD, dir)

  return ensureDir(dir)
  .then(function() {
    return writeFile(path.join(dir, "info.json"), stringify(chapter, {space: '  '}));
  }).then(function() {
    return git.createAndCommit(dir, u, commitMessage);
  });
}

Chapter.prototype.getBySha = function(hash) {
  // get old version of chapter
  // TODO
}

Chapter.prototype.fork = function(newUser) {
  // fork chapter to another user's directory
}

Chapter.prototype.getHead = function() {
  return git.getHead(global.storage + this.author + '/chapter/' + this.uuid);
}

Chapter.prototype.update = async function(diff) {
  var success = true;
  var updateMsg = "update: ";
  for (var field in diff) {
    if (field === "name") {
      updateMsg += "changed name from " + this.name + " to " + diff[field] + ". ";
      this.name = diff[field];
    } else if (field === "author" || field === "uuid") {
      success = false;
      return JSON.stringify({error: "author and uuid are read-only", field: field});
    } else if (field === "scraps") {
      // TODO validate scraps
      updateMsg += "updated scraps (TODO diff). ";
      this.scraps = diff[field];
    } else {
      success = false;
      return JSON.stringify({error: "unrecognized field " + field, field: field});
    }
  }
  var updateBlock = await this.save(updateMsg);
  updateBlock.message = updateMsg;
  return updateBlock;
}

module.exports = {
  Chapter: Chapter,
  reconstitute: async function(author, uuid, sha) {
    try {
      var rf = await readFile(global.storage + author + '/chapter/' + uuid + '/info.json', 'utf8');
      var data = JSON.parse(rf);
      return new Chapter(data.name, data.author, data.uuid, data.scraps);
    } catch (e) {
      console.log(e);
      return undefined;
    }
  }
}
