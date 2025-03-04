import type * as google from '../';
import debug from 'debug';
import core from './core.test';
import drive from './drive.test';
import sheets from './sheets.test';

const info = debug('test/google#index:info');
const pathroot = `/AF-AUTOMATEDTESTS/TEST-${+(new Date())}`;
info('Running tests against root path: ', pathroot);

type WindowWithLibs = {
  libsundertest: typeof google
};

localStorage.debug = '*,-*drive:trace';

// Wait for the window to finish loading
document.addEventListener('DOMContentLoaded', async () => {

  const libsundertest = (window as unknown as WindowWithLibs).libsundertest;

  const root = document.getElementById("root");
  if (!root) {
    console.log('ERROR: did not find root element!');
  } else {
    root.innerHTML = "The test is running!"
    /*
    info('Testing core:')
    await core(libsundertest);

    info('Testing drive:')
    await drive(libsundertest);
    */
    info('Testing sheets:')
    await sheets(libsundertest);
    info('All Google Tests Passed');

    info('All enabled tests passed, but you have drive and core commented out')
  }

});