'use strict';
const crypto=require('crypto');
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf){let bits=0,value=0,out='';for(const b of buf){value=(value<<8)|b;bits+=8;while(bits>=5){out+=ALPHABET[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=ALPHABET[(value<<(5-bits))&31];return out;}
function base32Decode(str){let bits=0,value=0,out=[];for(const ch of String(str).replace(/=+$/,'').toUpperCase()){const n=ALPHABET.indexOf(ch);if(n<0)throw new Error('Segredo TOTP inválido.');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
function gerarSegredo(){return base32Encode(crypto.randomBytes(20));}
function codigoTOTP(secret,at=Date.now()){const counter=Math.floor(at/30000);const msg=Buffer.alloc(8);msg.writeBigUInt64BE(BigInt(counter));const h=crypto.createHmac('sha1',base32Decode(secret)).update(msg).digest();const off=h[h.length-1]&15;const n=(h.readUInt32BE(off)&0x7fffffff)%1000000;return String(n).padStart(6,'0');}
function verificarTOTP(secret,codigo,at=Date.now()){if(!/^\d{6}$/.test(String(codigo||'')))return false;for(let w=-1;w<=1;w++)if(codigoTOTP(secret,at+w*30000)===String(codigo))return true;return false;}
function chave(){const raw=String(process.env.TOTP_ENCRYPTION_KEY||'');if(Buffer.byteLength(raw)<32)throw new Error('TOTP_ENCRYPTION_KEY deve ter pelo menos 32 bytes.');return crypto.createHash('sha256').update(raw).digest();}
function cifrar(secret){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',chave(),iv);const body=Buffer.concat([c.update(secret,'utf8'),c.final()]);return [iv.toString('base64'),c.getAuthTag().toString('base64'),body.toString('base64')].join('.');}
function decifrar(value){const [iv,tag,body]=String(value||'').split('.');const d=crypto.createDecipheriv('aes-256-gcm',chave(),Buffer.from(iv,'base64'));d.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([d.update(Buffer.from(body,'base64')),d.final()]).toString('utf8');}
module.exports={gerarSegredo,codigoTOTP,verificarTOTP,cifrar,decifrar};
