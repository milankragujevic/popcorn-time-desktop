import speedTest from 'speedtest-net';


export const timeout = 30000;

export async function getDownloadSpeed() {
  return new Promise((resolve, reject) => {
    speedTest({ maxTime: timeout })
      .on('downloadspeed', downloadSpeed => {
        resolve(downloadSpeed);
      })
      .on('error', error => {
        reject(error);
      });
  });
}

export async function getUploadSpeed() {
  return new Promise((resolve, reject) => {
    speedTest({ maxTime: timeout })
      .on('uploadspeed', uploadSpeed => {
        resolve(uploadSpeed);
      })
      .on('error', error => {
        reject(error);
      });
  });
}
