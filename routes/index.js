const express = require('express');
const router = express.Router();
const mysql = require('mysql');
const mybatisMapper = require('mybatis-mapper');
const format = {language: 'sql', indent: '  '};
require("dotenv").config();
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const util = require('util');
const client = new textToSpeech.TextToSpeechClient();
const jwt = require('jsonwebtoken');

const pool = mysql.createPool({
  connectionLimit : 10,
  host     : process.env.DATABASE_HOST,
  user     : process.env.DATABASE_USER,
  password : process.env.DATABASE_PWD+'##',
  database : process.env.DATABASE_DATABASE
});

mybatisMapper.createMapper([ './sql.xml' ]);


router.post('/join', function async(req, res, next) {
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

  pool.getConnection(function (err, connection) {
    if (err) {
      res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
      return;
    }

    connection.query(mybatisMapper.getStatement('youngjak', 'selectUserIdCnt', param, format), function (error, results, fields) {
      if (error) {
        res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
        connection.release();
        return;
      }

      if(results[0].USER_ID_CNT === 1) {
        res.send({success: false, msg: '이미 존재하는 아이디입니다.'});
        connection.release();
        return;
      }

      connection.query(mybatisMapper.getStatement('youngjak', 'insertUser', param, format), function (error, results, fields) {
        if (error) {
          res.send({success: 1, msg: '데이터 처리 실패. 다시 시도하세요.'});
          connection.release();
          return;
        }

        if(results.affectedRows != 1) {
          res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
          connection.release();
          return;
        }

        connection.release();
    
        res.send({success: true, msg: '회원가입을 축하합니다.'});
      });
    });
  });
});

router.post('/login', function(req, res, next) {
  const param = req.body;

  if(param.userId === undefined || param.userId === null) {
    res.send({success: false, msg: '아이디는 필수값입니다.'});
    return;
  }else if(param.userPwd === undefined || param.userPwd === null) {
    res.send({success: false, msg: '비밀번호는 필수값입니다.'});
    return;
  }

  pool.getConnection(function (err, connection) {
    if (err) {
      res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
      return;
    }

    connection.query(mybatisMapper.getStatement('youngjak', 'selectUserIdCnt', param, format), function (error, results, fields) {
      if (error) {
        res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
        connection.release();
        return;
      }

      if(results[0].USER_ID_CNT === 0) {
        res.send({success: false, msg: '존재하지 않는 아이디입니다.'});
        connection.release();
        return;
      }

      connection.query(mybatisMapper.getStatement('youngjak', 'selectUserPwdCnt', param, format), function (error, results, fields) {
        if (error) {
          res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
          connection.release();
          return;
        }

        if(results[0].USER_PWD_CNT === 0) {
          res.send({success: false, msg: '비밀번호가 일치하지 않습니다.'});
          connection.release();
          return;
        }

        connection.release();
    
        res.send({success: true, msg: '', token: jwt.sign({ userId: param.userId }, process.env.JWT_SECRET_KEY)});
      });
    });
  });
});

router.post('/setText', function(req, res, next) {
  const param = req.body;
  let success = true;
  let msg = '';
  console.log(param);

  jwt.verify(param.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if(err) {
      res.send({success: false, errName: 'JWT_FAIL', msg: '인증되지 않았습니다. 로그인 후 이용해주세요.'});
      return;
    }

    param.userId = decoded.userId;
    console.log(decoded.userId);
  });
  console.log(param);

  if(param.textKr === undefined || param.textKr === null || param.textKr === '') {
    success = false;
    msg = '한글 문장은 필수값입니다.';
  }else if(param.textEn === undefined || param.textEn === null || param.textEn === '') {
    success = false;
    msg = '영문 문장은 필수값입니다.';
  }

  if(!success) {
    res.send({success: success, msg: msg});
    return;
  }

  pool.getConnection(function (err, connection) {
    if (err) {
      res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
      return;
    }

    connection.beginTransaction(function(err) {
      if (err) {
        res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
        connection.release();
        return;
      }

      connection.query(mybatisMapper.getStatement('youngjak', 'inserText', param, format), function (error, results, fields) {
        if (error) {
          console.log(error);
          connection.rollback();
          res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
          connection.release();
          return;
        }
        console.log(results);
        console.log(results.insertId);

        connection.commit();

        connection.release();
        
        res.send({success: true, msg: '데이터 저장 성공.'});
      });
    });
  });
});


// router.post('/setText', function(req, res, next) {
//   const param = req.body;

//   if(param.userId === undefined || param.userId === null || param.userId === '') {
//     res.send({success: false, msg: '아이디는 필수값입니다.'});
//     return;
//   }

//   if(param.textKr === undefined || param.textKr === null || param.textKr === '') {
//     res.send({success: false, msg: '한글 문장은 필수값입니다.'});
//     return;
//   }

//   if(param.textEn === undefined || param.textEn === null || param.textEn === '') {
//     res.send({success: false, msg: '영문 문장은 필수값입니다.'});
//     return;
//   }

//   connection.query(mybatisMapper.getStatement('youngjak', 'selectUserIdCnt', param, format), function (error, results, fields) {
//     if (error) {
//       res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
//       return;
//     }

//     if(results[0].USER_ID_CNT === 0) {
//       res.send({success: false, msg: '존재하지 않는 아이디입니다.'});
//       return;
//     }

//     connection.query(mybatisMapper.getStatement('youngjak', 'selectUserPwdCnt', param, format), function (error, results, fields) {
//       if (error) {
//         res.send({success: 1, msg: '데이터 처리 실패. 다시 시도하세요.'});
//         return;
//       }

//       if(results[0].USER_ID_CNT) {
//         res.send({success: false, msg: '비밀번호가 일치하지 않습니다.'});
//         return;
//       }
  
//       res.send({success: true, msg: '' });
//     });
//   });
// });

// router.post('/loginCheck', function(req, res, next) {
//   // console.log('1');
//   // console.log(req.body.token);
//   // console.log('2');
//   jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
//     if(err) {
//       // console.log(err);
//       res.send({success: false, msg: ''});
//       return;
//     }

//     // console.log(decoded.userId);
//     res.send({success: true, msg: ''});
//   });
// });

// router.get('/tts', async(req, res, next) => {
//   console.log(req.query);
//   const request = {
//     input: {text: req.query.text},
//     voice: {languageCode: req.query.lang, ssmlGender: req.query.voice},
//     audioConfig: {audioEncoding: 'LINEAR16', speakingRate : 1},
//   };

//   const [response] = await client.synthesizeSpeech(request);

//   res.send(response.audioContent);
// });

module.exports = router;
