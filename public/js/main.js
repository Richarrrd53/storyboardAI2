const ifm = document.createElement("iframe");
ifm.id = "ifm";
ifm.src = "./html/index.html";
document.body.appendChild(ifm);


const deviceWidth = window.innerWidth;
const deviceHeight = window.innerHeight;

let globalWidth;
let globalHeight;
let count = 0;
adjustScale();

function adjustScale(){
    globalWidth = 1920;
    globalHeight = 1080;
    ifm.style.width = globalWidth + "px";
    ifm.style.height = globalHeight + "px";
    if (globalHeight*(deviceWidth/globalWidth) > window.innerHeight){
        ifm.style.scale = deviceHeight/globalHeight;
        ifm.style.left = (deviceWidth-globalWidth*(deviceHeight/globalHeight))/2 + "px";
    }
    else{
        ifm.style.scale = deviceWidth/globalWidth;
        ifm.style.left = 0;
    }
}

document.addEventListener('fullscreenchange', () => {
    adjustScale();
    const deviceWidth = window.innerWidth;
    const deviceHeight = window.innerHeight;
    if (globalHeight*(deviceWidth/globalWidth) > window.innerHeight){
        ifm.style.scale = deviceHeight/globalHeight;
        ifm.style.left = (deviceWidth-globalWidth*(deviceHeight/globalHeight))/2 + "px";
    }
    else{
        ifm.style.scale = deviceWidth/globalWidth;
        ifm.style.left = 0;
    }
    handleFullscreenChange();
  });

function fullScreenBtnClick(x){
    fullscreen();
    x.style.display = 'none';
}

window.addEventListener('resize', () => {
    const deviceWidth = window.innerWidth;
    const deviceHeight = window.innerHeight;
    if (globalHeight*(deviceWidth/globalWidth) > window.innerHeight){
        ifm.style.scale = deviceHeight/globalHeight;
        ifm.style.left = (deviceWidth-globalWidth*(deviceHeight/globalHeight))/2 + "px";
    }
    else{
        ifm.style.scale = deviceWidth/globalWidth;
        ifm.style.left = 0;
    }
})


function fullscreen() {
    // check if fullscreen mode is available
    if (document.fullscreenEnabled ||
        document.webkitFullscreenEnabled ||
        document.mozFullScreenEnabled ||
        document.msFullscreenEnabled) {
        // Do fullscreen
        if (document.body.requestFullscreen) {
            document.body.requestFullscreen();
        } else if (document.body.webkitRequestFullscreen) {
            document.body.webkitRequestFullscreen();
        } else if (document.body.mozRequestFullScreen) {
            document.body.mozRequestFullScreen();
        } else if (document.body.msRequestFullscreen) {
            document.body.msRequestFullscreen();
        }
    }
    else {
        document.querySelector('.error').innerHTML = 'Your browser is not supported';
    }
}
