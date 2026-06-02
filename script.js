import { Adb, AdbDaemonTransport } from 'https://esm.sh/@yume-chan/adb@0.0.22';
import { AdbDaemonWebUsbDeviceManager } from 'https://esm.sh/@yume-chan/adb-daemon-webusb@0.0.22';
import AdbWebCredentialStore from 'https://esm.sh/@yume-chan/adb-credential-web@0.0.22';
import { DecodeUtf8Stream } from 'https://esm.sh/@yume-chan/stream-extra@0.0.22';

const terminal = document.getElementById('terminal');
const btnConnect = document.getElementById('btnConnect');
const statusText = document.getElementById('statusText');
let currentAdb = null;

function logRaw(html) {
    terminal.innerHTML += `<div>${html}</div>`;
    terminal.scrollTop = terminal.scrollHeight;
}

function logInfo(label, value) {
    logRaw(`
        <div class="info-row">
            <div class="info-label">${label}</div>
            <div class="info-colon">:</div>
            <div class="info-value">${value}</div>
        </div>
    `);
}

async function readShellOutput(process) {
    let output = "";
    const reader = process.stdout.pipeThrough(new DecodeUtf8Stream()).getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += value;
    }
    return output;
}

function extractProp(text, propName) {
    const regex = new RegExp(`\\[${propName}\\]: \\[(.*?)\\]`);
    const match = text.match(regex);
    return match ? match[1] : 'N/A';
}

btnConnect.addEventListener('click', async () => {
    try {
        statusText.innerText = "Status: Waiting for USB Device...";
        const Manager = window.navigator.usb ? AdbDaemonWebUsbDeviceManager.BROWSER : undefined;
        if (!Manager) return logRaw("<span class='color-red'>Browser does not support WebUSB!</span>");

        const device = await Manager.requestDevice();
        if (!device) {
            statusText.innerText = "Status: Canceled";
            return;
        }
        
        statusText.innerText = "Status: Authenticating...";
        const connection = await device.connect();
        const credentialStore = new AdbWebCredentialStore();
        const transport = await AdbDaemonTransport.authenticate({ serial: device.serial, connection, credentialStore });
        currentAdb = new Adb(transport);

        statusText.innerText = "Status: Reading Data...";
        
        logRaw(`<br><span class="color-black">=====================================</span>`);
        logRaw(`<span class="color-blue">      Powered by WWW.GSMHi.COM       </span>`);
        logRaw(`<span class="color-black">=====================================</span>`);
        
        logRaw(`<span class="color-green">Using port WebUSB Device (${device.serial})</span>`);
        logRaw(`<span class="color-green">Reading info mode ADB ... OK</span>`);

        const process = await currentAdb.subprocess.spawn('getprop');
        const props = await readShellOutput(process);

        const model = extractProp(props, 'ro.product.model');
        const csc = extractProp(props, 'ro.csc.sales_code') || extractProp(props, 'ril.sales_code');
        const ap = extractProp(props, 'ro.build.display.id');
        const bl = extractProp(props, 'ro.bootloader');
        const cp = extractProp(props, 'gsm.version.baseband') || extractProp(props, 'ro.boot.baseband');
        const csc_version = extractProp(props, 'ro.build.version.incremental'); 
        const sn = extractProp(props, 'ro.serialno');
        const country = extractProp(props, 'ro.csc.country_iso') || csc;
        const androidVer = extractProp(props, 'ro.build.version.release');
        
        const processFrp = await currentAdb.subprocess.spawn('settings get secure secure_frp_mode');
        const frpRaw = await readShellOutput(processFrp);
        const frpStatus = frpRaw.includes('1') ? 'TRIGGERED' : 'NONE / UNKNOWN';

        logInfo('Model', model);
        logInfo('CSC', csc);
        logInfo('AP version', ap);
        logInfo('BL version', bl);
        logInfo('CP version', cp);
        logInfo('CSC version', csc_version);
        logInfo('IMEI', 'Reading via ADB not supported (Need MTP)');
        logInfo('SN', sn);
        logInfo('Lock status', 'NONE');
        logInfo('Country', country);
        logInfo('USB mode', 'ADB');
        logInfo('Unique number', device.serial);
        logInfo('Android version', androidVer);
        
        if(frpStatus === 'TRIGGERED') {
            logRaw(`<div class="info-row"><div class="info-label">FRP status</div><div class="info-colon">:</div><div class="color-red">${frpStatus}</div></div>`);
        } else {
            logInfo('FRP status', frpStatus);
        }

        logRaw(`<br><span class="color-green">Operation completed successfully.</span>`);
        statusText.innerText = "Status: Ready (Operation Completed)";

        await currentAdb.close();
        currentAdb = null;

    } catch (err) {
        logRaw(`<br><span class='color-red'>Reading FAIL: ${err.message}</span>`);
        statusText.innerText = "Status: Error occurred";
        if (currentAdb) { await currentAdb.close().catch(() => {}); currentAdb = null; }
    }
});