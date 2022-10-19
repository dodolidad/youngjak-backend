const express = require('express');
const router = express.Router();
const mysql = require('mysql');
const mybatisMapper = require('mybatis-mapper');
const format = {language: 'sql', indent: '  '};

const connection = mysql.createConnection({
  host     : process.env.DATABASE_HOST,
  user     : process.env.DATABASE_USER,
  password : process.env.DATABASE_PWD,
  database : process.env.DATABASE_DATABASE,
});

connection.connect(function(err) {
  if (err) {
    console.error('error connecting: ' + err.stack);
    return;
  }

  console.log('connected as id ' + connection.threadId);
});

mybatisMapper.createMapper([ './sql.xml' ]);


router.post('/join', function(req, res, next) {
  const param = req.body;
  const idRegExp = /^[a-zA-z0-9]{4,12}$/;
  const pwdRegExp = /^[a-zA-z0-9]{4,12}$/;

  if(param.userId === undefined || param.userId === null) {
    res.send({success: false, msg: '아이디는 필수값입니다.'});
    return;
  }
  if (!idRegExp.test(param.userId)) {
    res.send({success: false, msg: '아이디는 영문 대소문자와 숫자 4~12자리로 입력해야합니다!'});
    return;
  }
  if(param.userPwd === undefined || param.userPwd === null) {
    res.send({success: false, msg: '비밀번호는 필수값입니다.'});
    return;
  }
  if (!pwdRegExp.test(param.userPwd)) {
    res.send({success: false, msg: '비밀번호는 영문 대소문자와 숫자 4~12자리로 입력해야합니다!'});
    return;
  }
  if(param.chgPwdQst === undefined || param.chgPwdQst === null) {
    res.send({success: false, msg: '질문(비밀번호 찾기)는 필수값입니다.'});
    return;
  }
  if(param.chgPwdQst.length < 2) {
    res.send({success: false, msg: '질문(비밀번호 찾기)는 1자리 이상이어야합니다.'});
    return;
  }
  if(param.chgPwdAns === undefined || param.chgPwdAns === null) {
    res.send({success: false, msg: '답변(비밀번호 찾기)는 필수값입니다.'});
    return;
  }
  if(param.chgPwdAns.length < 2) {
    res.send({success: false, msg: '답변(비밀번호 찾기)는 1자리 이상이어야합니다.'});
    return;
  }

  connection.query(mybatisMapper.getStatement('youngjak', 'selectUserIdCnt', param, format), function (error, results, fields) {
    if (error) {
      res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
      return;
    }

    if(results[0].USER_ID_CNT === 1) {
      res.send({success: false, msg: '이미 존재하는 아이디입니다.'});
      return;
    }

    connection.query(mybatisMapper.getStatement('youngjak', 'insertUser', param, format), function (error, results, fields) {
      if (error) {
        res.send({success: 1, msg: '데이터 처리 실패. 다시 시도하세요.'});
        return;
      }

      if(results.affectedRows != 1) {
        res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
        return;
      }
  
      res.send({success: true, msg: ''});
    });
  });
});

router.post('/login', function(req, res, next) {
  const param = req.body;

  if(param.userId === undefined || param.userId === null) {
    res.send({success: false, msg: '아이디는 필수값입니다.'});
    return;
  }

  if(param.userPwd === undefined || param.userPwd === null) {
    res.send({success: false, msg: '비밀번호는 필수값입니다.'});
    return;
  }

  connection.query(mybatisMapper.getStatement('youngjak', 'selectUserIdCnt', param, format), function (error, results, fields) {
    if (error) {
      res.send({success: false, msg: '데이터 처리 실패. 다시 시도하세요.'});
      return;
    }

    if(results[0].USER_ID_CNT === 0) {
      res.send({success: false, msg: '존재하지 않는 아이디입니다.'});
      return;
    }

    connection.query(mybatisMapper.getStatement('youngjak', 'selectUserPwdCnt', param, format), function (error, results, fields) {
      if (error) {
        res.send({success: 1, msg: '데이터 처리 실패. 다시 시도하세요.'});
        return;
      }

      if(results[0].USER_ID_CNT) {
        res.send({success: false, msg: '비밀번호가 일치하지 않습니다.'});
        return;
      }
  
      res.send({success: true, msg: ''});
    });
  });
});

module.exports = router;
