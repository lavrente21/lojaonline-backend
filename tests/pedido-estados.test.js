'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {validarTransicao,TRANSICOES}=require('../services/pedido-estados');
const totp=require('../services/totp');
test('máquina de estados aceita avanço válido e rejeita salto inválido',()=>{assert.equal(validarTransicao('aguarda_pagamento','pago'),true);assert.throws(()=>validarTransicao('aguarda_pagamento','entregue'),{status:409});assert.deepEqual(TRANSICOES.cancelado,[]);});
test('TOTP gera código de seis dígitos verificável e rejeita código malformado',()=>{const secret=totp.gerarSegredo();const code=totp.codigoTOTP(secret,1800000000000);assert.match(code,/^\d{6}$/);assert.equal(totp.verificarTOTP(secret,code,1800000000000),true);assert.equal(totp.verificarTOTP(secret,'123',1800000000000),false);});
test('segredo TOTP é cifrado e autenticado',{skip:!process.env.TOTP_ENCRYPTION_KEY},()=>{const value=totp.cifrar('JBSWY3DPEHPK3PXP');assert.notEqual(value,'JBSWY3DPEHPK3PXP');assert.equal(totp.decifrar(value),'JBSWY3DPEHPK3PXP');assert.throws(()=>totp.decifrar(value.slice(0,-4)+'AAAA'));});
