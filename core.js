const qs = require('qs');
const crypto = require('crypto');
const axios = require('axios');

let token = '';

const config = {
  host: 'https://openapi.tuyaus.com',
  accessKey: 'a7fy5t5vwayqe85tp4hq',
  secretKey: '7f9b1392ba3349968d92c64ecc3a11b0',
  deviceId: 'eb375f2eacf9c57a235qdq',
};

const httpClient = axios.create({
  baseURL: config.host,
  timeout: 5 * 1e3,
});

async function main() {
  await getToken();
  const data = await getDeviceInfo(config.deviceId);
  console.log('fetch success: ', JSON.stringify(data));
}

async function getToken() {
  const method = 'GET';
  const timestamp = Date.now().toString();
  const signUrl = '/v1.0/token?grant_type=1';
  const contentHash = crypto.createHash('sha256').update('').digest('hex');
  const stringToSign = [method, contentHash, '', signUrl].join('\n');
  const signStr = config.accessKey + timestamp + stringToSign;

  const headers = {
    t: timestamp,
    sign_method: 'HMAC-SHA256',
    client_id: config.accessKey,
    sign: await encryptStr(signStr, config.secretKey),
  };
  const { data: login } = await httpClient.get('/v1.0/token?grant_type=1', { headers });
  if (!login || !login.success) {
    throw Error(`fetch failed: ${login.msg}`);
  }
  token = login.result.access_token;
}

async function getDeviceInfo(deviceId) {
  const body = {
    commands: [
      {
        code: 'switch_led',
        value: true
      }
    ]
  };
  const method = 'POST';
  const url = `/v1.0/devices/${deviceId}/commands`;
  const reqHeaders = await getRequestSign(url, method, {}, {}, body);

  const { data } = await httpClient.request({
    method,
    data: body,
    params: {},
    headers: reqHeaders,
    url: reqHeaders.path,
  });
  if (!data || !data.success) {
    throw Error(`request api failed: ${data.msg}`);
  }
  return data; // <-- Agrega esta línea
}

async function setFoco(deviceId, on) {
  const body = {
    commands: [
      {
        code: 'switch_led',
        value: on
      }
    ]
  };
  const method = 'POST';
  const url = `/v1.0/devices/${deviceId}/commands`;
  const reqHeaders = await getRequestSign(url, method, {}, {}, body);

  const { data } = await httpClient.request({
    method,
    data: body,
    params: {},
    headers: reqHeaders,
    url: reqHeaders.path,
  });
  if (!data || !data.success) {
    throw Error(`request api failed: ${data.msg}`);
  }
}

async function encryptStr(str, secret) {
  return crypto.createHmac('sha256', secret).update(str, 'utf8').digest('hex').toUpperCase();
}

async function getRequestSign(
  path,
  method,
  headers = {},
  query = {},
  body = {},
) {
  const t = Date.now().toString();
  const [uri, pathQuery] = path.split('?');
  const queryMerged = Object.assign(query, qs.parse(pathQuery));
  const sortedQuery = {};
  Object.keys(queryMerged)
    .sort()
    .forEach((i) => (sortedQuery[i] = query[i]));

  const querystring = decodeURIComponent(qs.stringify(sortedQuery));
  const url = querystring ? `${uri}?${querystring}` : uri;
  const contentHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const stringToSign = [method, contentHash, '', url].join('\n');
  const signStr = config.accessKey + token + t + stringToSign;
  return {
    t,
    path: url,
    client_id: config.accessKey,
    sign: await encryptStr(signStr, config.secretKey),
    sign_method: 'HMAC-SHA256',
    access_token: token,
  };
}

// Exportar funciones para usarlas en otros archivos
module.exports = { setFoco, config, main, getDeviceInfo };

main().catch(err => {
  throw Error(`error: ${err}`);
});