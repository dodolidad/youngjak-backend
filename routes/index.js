const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const mybatisMapper = require('mybatis-mapper');
const format = {language: 'sql', indent: '  '};
require("dotenv").config();
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const util = require('util');
const client = new textToSpeech.TextToSpeechClient();
const jwt = require('jsonwebtoken');
var macaddress = require('macaddress');
const path = require('path');

let decoded = null;
let decoded1 = null;

const pool = mysql.createPool({
  connectionLimit : 10,
  host     : process.env.DATABASE_HOST,
  user     : process.env.DATABASE_USER,
  password : process.env.DATABASE_PWD+'##',
  database : process.env.DATABASE_DATABASE
});

mybatisMapper.createMapper([ './sql.xml' ]);

router.post('/setText', async function(req, res, next) {
  const param = req.body;

  //유효성 체크
  let chkValidResult = await chkValid('/setText', param);
  if(!chkValidResult.success) {
    res.send(chkValidResult);
    return;
  }

  param.userId = decoded.userId;
  param.textId = Date.now();

  let textKrs = param.textKr.split('\n');

  for(let i = 1; i <= textKrs.length; i++) {
    let textKr = textKrs[i - 1].substr(3);
    let textVoice = textKrs[i - 1].substr(0, 3);
    let textName = 'ko-KR-Wavenet-B';
    let outputFile = './sounds/' + param.textId + i + 'kr.mp3';

    if(textVoice === '남1:') textName = 'ko-KR-Wavenet-C'
    else if(textVoice === '남2:') textName = 'ko-KR-Wavenet-D'
    else if(textVoice === '여1:') textName = 'ko-KR-Wavenet-B'
    else if(textVoice === '여2:') textName = 'ko-KR-Wavenet-A'

    const request = {
      input: {text: textKr},
      voice: {languageCode: 'ko-KR', name: textName},
      audioConfig: {audioEncoding: 'MP3'},
    };
    try{
      const [response] = await client.synthesizeSpeech(request);
      const writeFile = util.promisify(fs.writeFile);
      await writeFile(outputFile, response.audioContent, 'binary');
    }catch(err) {
      res.send({success: false, msg: '음성파일 저장 실패.'});
      return;
    }
  }

  let textEns = param.textEn.split('\n');

  for(let i = 1; i <= textEns.length; i++) {
    let textEn = textEns[i - 1].substr(3);
    let textVoice = textEns[i - 1].substr(0, 3);
    let textName = 'en-US-Wavenet-C';
    let outputFile = './sounds/' + param.textId + i + 'en.mp3';

    if(textVoice === '남1:') textName = 'en-US-Wavenet-A'
    else if(textVoice === '남2:') textName = 'en-US-Wavenet-B'
    else if(textVoice === '여1:') textName = 'en-US-Wavenet-C'
    else if(textVoice === '여2:') textName = 'en-US-Wavenet-F'

    const request = {
      input: {text: textEn},
      voice: {languageCode: 'en-US', name: textName},
      audioConfig: {audioEncoding: 'MP3'},
    };
    try{
      const [response] = await client.synthesizeSpeech(request);
      const writeFile = util.promisify(fs.writeFile);
      await writeFile(outputFile, response.audioContent, 'binary');
    }catch(err) {
      res.send({success: false, msg: '음성파일 저장 실패.'});
      return;
    }
  }

  const connection = await pool.getConnection(async conn => conn);

  try {
    await connection.beginTransaction();
    
    for(let i = 1; i <= textKrs.length; i++) {
      let newParam = {textId: param.textId, idx: i, textKr: textKrs[i - 1], textEn: textEns[i - 1], userId: param.userId};

      await connection.query(mybatisMapper.getStatement('youngjak', 'inserText', newParam, format));

      if(i === 1) await connection.query(mybatisMapper.getStatement('youngjak', 'inserUserText', newParam, format));
    }

    await connection.commit();
  } catch (err) {
      await connection.rollback();

      res.send({success: false, msg: '데이터 저장 실패.'});
      return;
  } finally {
      connection.release();
  }

  res.send({success: true, msg: '데이터 저장 성공.'});
});

router.post('/setMyText', async function(req, res, next) {
  const param = req.body;

  try {
    decoded = jwt.verify(param.token, process.env.JWT_SECRET_KEY);
  } catch (err) {
    return {success: false, errName: 'JWT_FAIL', msg: '인증되지 않았습니다. 로그인 후 이용해주세요.'};
  }

  param.userId = decoded.userId;
  param.useYn = 'Y';

  const connection = await pool.getConnection(async conn => conn);

  try {
    await connection.beginTransaction();
    console.log(param);

    let [results] = await connection.query(mybatisMapper.getStatement('youngjak', 'getUserText', param, format));
    console.log(results);
    if(results.length !== 0) {
      res.send({success: false, msg: '이미 저장되어있습니다.'});
      return;
    }
    
    await connection.query(mybatisMapper.getStatement('youngjak', 'inserUserText', param, format));

    await connection.commit();
  } catch (err) {
      await connection.rollback();

      res.send({success: false, msg: '데이터 저장 실패.'});
      return;
  } finally {
      connection.release();
  }

  res.send({success: true, msg: '데이터 저장 성공.'});
});

router.get('/getTextOneRandomForGuest', async function(req, res, next) {
  const connection = await pool.getConnection(async conn => conn);

  try {
    const [results, fields] = await connection.query(mybatisMapper.getStatement('youngjak', 'getTextOneRandomForGuest', {}, format));
    res.send({success: true, msg: '', results});
  } catch (err) {
      res.send({success: false, msg: '데이터 조회 실패.'});
      return;
  } finally {
      connection.release();
  }
});

router.get('/getSound', async function(req, res, next) {
  try{
    let filePath = path.join(__dirname, '../sounds/' + req.query.textId + req.query.idx + req.query.lang + '.mp3');
    res.sendFile(filePath);
  } catch(err) {

  }
});

router.post('/join', async function(req, res, next) {
  const param = req.body;
  const idRegExp = /^[a-zA-z0-9]{4,12}$/;
  const pwdRegExp = /^[a-zA-z0-9]{4,12}$/;
  let success = true;
  let msg = '';

  if(param.userId === undefined || param.userId === null) {
    success = false;
    msg = '아이디는 필수값입니다.';
  }else if (!idRegExp.test(param.userId)) {
    success = false;
    msg = '아이디는 영문 대소문자와 숫자 4~12자리로 입력해야합니다.';
  }else if(param.userPwd === undefined || param.userPwd === null) {
    success = false;
    msg = '비밀번호는 필수값입니다.';
  }else if (!pwdRegExp.test(param.userPwd)) {
    success = false;
    msg = '비밀번호는 영문 대소문자와 숫자 4~12자리로 입력해야합니다.';
  }else if(param.chgPwdQst === undefined || param.chgPwdQst === null) {
    success = false;
    msg = '질문(비밀번호 찾기)는 필수값입니다.';
  }else if(param.chgPwdQst.length < 2) {
    success = false;
    msg = '질문(비밀번호 찾기)는 2자리 이상이어야합니다.';
  }else if(param.chgPwdAns === undefined || param.chgPwdAns === null) {
    success = false;
    msg = '답변(비밀번호 찾기)는 필수값입니다.';
  }else if(param.chgPwdAns.length < 2) {
    success = false;
    msg = '답변(비밀번호 찾기)는 2자리 이상이어야합니다.';
  }

  if(!success) {
    res.send({success: success, msg: msg});
    return;
  }

  const connection = await pool.getConnection(async conn => conn);

  try {
    await connection.beginTransaction();

    let [results] = await connection.query(mybatisMapper.getStatement('youngjak', 'getUserIdCnt', param, format));

    if(results[0].USER_ID_CNT === 1) {
      connection.release();
      res.send({success: false, msg: '이미 존재하는 아이디입니다.'});
      return;
    }

    [results] = await connection.query(mybatisMapper.getStatement('youngjak', 'insertUser', param, format));

    if(results.affectedRows !== 1) {
      connection.release();
      res.send({success: false, msg: '데이터 저장 실패.'});
      return;
    }

    await connection.commit();
  } catch (err) {
      await connection.rollback();

      res.send({success: false, msg: '데이터 저장 실패.'});
      return;
  } finally {
      connection.release();
  }

  res.send({success: true, msg: '회원가입을 축하합니다.'});
});

router.post('/login', async function(req, res, next) {
  const param = req.body;

  if(param.userId === undefined || param.userId === null) {
    res.send({success: false, msg: '아이디는 필수값입니다.'});
    return;
  }else if(param.userPwd === undefined || param.userPwd === null) {
    res.send({success: false, msg: '비밀번호는 필수값입니다.'});
    return;
  }

  const connection = await pool.getConnection(async conn => conn);

  try {
    let [results] = await connection.query(mybatisMapper.getStatement('youngjak', 'getUserIdCnt', param, format));

    if(results[0].USER_ID_CNT === 0) {
      connection.release();
      res.send({success: false, msg: '존재하지 않는 아이디입니다.'});
      return;
    }

    [results] = await connection.query(mybatisMapper.getStatement('youngjak', 'getUser', param, format));

    if(results.length !== 1) {
      connection.release();
      res.send({success: false, msg: '비밀번호가 일치하지 않습니다.'});
      return;
    }

    const mac = await macaddress.one();

    let userAuth = results[0].USER_AUTH;

    if(userAuth === 'A') {
      res.send({success: true, msg: '', 
        token: jwt.sign({ userId: param.userId, mac: mac }, process.env.JWT_SECRET_KEY), 
        token1: jwt.sign({ userAuth: userAuth, mac: mac }, process.env.JWT_SECRET_KEY), });
    } else {
      res.send({success: true, msg: '', token: jwt.sign({ userId: param.userId, mac: mac }, process.env.JWT_SECRET_KEY)});
    }
  } catch (err) {
    res.send({success: false, msg: '데이터 조회 실패.'});
    return;
  } finally {
      connection.release();
  }
});



const chkValid = async (pathName, param) => {
  let mac;

  if(pathName === '/setText') {
    if(param.token1 === null || param.token1 === undefined) {
      return {success: false, msg: '쓰기 권한이 없는 계정입니다.'};
    }

    if(param.token === null || param.token === undefined) {
      return {success: false, errName: 'JWT_FAIL', msg: '쓰기 권한이 없는 계정입니다.'};
    }
  
    try {
      mac = await macaddress.one();
    } catch (err) {
      return {success: false, errName: 'JWT_FAIL', msg: '인증되지 않았습니다. 로그인 후 이용해주세요.'};
    }
  
    try {
      decoded = jwt.verify(param.token, process.env.JWT_SECRET_KEY);
      decoded1 = jwt.verify(param.token1, process.env.JWT_SECRET_KEY);
    } catch (err) {
      return {success: false, errName: 'JWT_FAIL', msg: '인증되지 않았습니다. 로그인 후 이용해주세요.'};
    }

    if(mac !== decoded.mac || mac !== decoded1.mac) {
      return {success: false, errName: 'JWT_FAIL', msg: '인증되지 않았습니다. 로그인 후 이용해주세요.'};
    }
  
    if(param.textKr === undefined || param.textKr === null || param.textKr === '') {
      return {success: false, msg: '한글 문장은 필수값입니다.'};
    }
    
    if(param.textEn === undefined || param.textEn === null || param.textEn === '') {
      return {success: false, msg: '영문 문장은 필수값입니다.'};
    }
  } else if(pathName === 'login') {

  }

  return {success: true, msg: ''};
}

module.exports = router;
