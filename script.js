const DOMRenderer = {
  render() {
    const panels = ['callStack', 'webAPIs', 'microtasks', 'macrotasks'];
    panels.forEach(panel => {
      const container = document.getElementById(`content-${panel}`);
      container.innerHTML = ''; 
      
      EventLoopState[panel].forEach(taskName => {
        const taskElement = document.createElement('div');
        taskElement.className = 'task-block';
        taskElement.textContent = taskName;
        
        // Color coding borders
        if (panel === 'callStack') taskElement.style.borderLeftColor = '#58a6ff';
        if (panel === 'microtasks') taskElement.style.borderLeftColor = '#d2a8ff';
        if (panel === 'macrotasks') taskElement.style.borderLeftColor = '#3fb950';
        if (panel === 'webAPIs') taskElement.style.borderLeftColor = '#bc8cff';
        
        container.appendChild(taskElement);
      });
    });
  }
};


const EventLoopState = {
    callStack: [], 
    webAPIs: [],
    microtasks: [],
    macrotasks: [],

    log(panel,message){
        this[panel].push(message);
        DOMRenderer.render();
    },

    clearTask(panel,message){
        const index =  this[panel].indexOf(message);
        if(index > 1) this[panel].splice(index,1);
        DOMRenderer.render();
    },

    resetAll(){
        this.callStack=[];
        this.webAPIs = [];
        this.microtasks = [];
        this.macrotasks = [];
        DOMRenderer.render();
    }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve,ms));

class AsyncBatcher{
    constructor(option = {}){
        this.maxBatchSize = option.maxBatchSize || 10;
        this.maxWaitTime = option.maxWaitTime || 500;
        this.priority = option.priority || "Low";
        this.buffer =[];
        this.timer = null;

        this.onExecute = async (batch, queueName) => {
            EventLoopState.log('callStack', `Executing Batch ${batch.length} items from ${queueName}`);
            await sleep(800);
            EventLoopState.clearTask('callStack', `Executing Batch ${batch.length} items from ${queueName}`);
        }
    }

    async add(payload){
        EventLoopState.log('callStack', `AsyncBatcher.add( ${payload} )`);
        this.buffer.push(payload);

        setTimeout(() => EventLoopState.clearTask('callStack',`AsyncBatcher.add( ${payload})`), 200);

        if(this.buffer.length >= this.maxBatchSize){
            this.triggerFlush('SIZE_LIMIT');
            return;
        }

        if(!this.timer){
            clearTimeout(this.timer);
            this.timer = null;
            EventLoopState.clearTask('webAPIs', `Batch Timer Started (${this.maxWaitTime}ms)`)
        }

        const batchToProcess = [...this.buffer];
        this.buffer=[];
        if(batchToProcess.length === 0) return 0;

        if(this.priority === 'High'){
            const taskName = `Microtask Batch (${this.maxWaitTime}ms)`;
            EventLoopState.log('microtasks',taskName);

            queueMicrotask(async ()=>{
                EventLoopState.clearTask('microtasks', taskName);
                await this.onExecute(batchToProcess, 'Microtask Queue');
            });
        }else{
            const taskName = `Macrotask Batch (${this.maxWaitTime}ms)`;
            EventLoopState.log('macrotasks', taskName);

            setTimeout(async ()=>{
                EventLoopState.clearTask('macrotasks',taskName);
                await this.onExecute(batchToProcess, 'Macrotask Queue');
            },0);
        }
    }

    reset() {
       if(this.timer) clearTimeout(this.timer);
       this.timer =null;
       this.buffer= [];
    }
}

const batcher = new AsyncBatcher({ maxBatchSize: 10, maxWaitTime: 2000, priority: 'Low' });

// Button 1: Trigger Batch Spike
document.getElementById('btn-spike').addEventListener('click', async () => {
  EventLoopState.resetAll();
  batcher.reset();

  // Firing 50 rapid events. Since max size is 10, this should trigger 5 immediate flushes.
  for(let i=0;i<50;i++){
    batcher.add(`Event${i}`);
    if(i%10 === 0 )await sleep(100) //tiny visual stagger   
  }
});

// Button 2: Race Condition (Animated visualization of starvation)
document.getElementById('btn-race').addEventListener('click', async () => {
  EventLoopState.resetAll();
  batcher.reset();

  EventLoopState.log('callStack', 'Script Start');
  await sleep(600);
  EventLoopState.clearTask('callStack', 'Script Start');

  // 1. Schedule Macrotask
  EventLoopState.log('callStack', 'setTimeout(cb, 0)');
  await sleep(600);
  EventLoopState.log('webAPIs', 'Timer Countdown');
  EventLoopState.clearTask('callStack', 'setTimeout(cb, 0)');

  await sleep(400);
  EventLoopState.clearTask('webAPIs', 'Timer Countdown');
  EventLoopState.log('macrotasks', 'Timeout Callback'); // Enters Macrotask queue

  // 2. Schedule Microtasks
  EventLoopState.log('callStack', 'Promise.resolve().then()');
  await sleep(600);
  EventLoopState.log('microtasks', 'Promise Callback');
  EventLoopState.clearTask('callStack', 'Promise.resolve().then()');

  EventLoopState.log('callStack', 'queueMicrotask()');
  await sleep(600);
  EventLoopState.log('microtasks', 'queueMicrotask Callback');
  EventLoopState.clearTask('callStack', 'queueMicrotask()');

  // --- THE EVENT LOOP DRAINAGE PHASE ---
  
  // Microtasks ALWAYS execute first and starve the Macrotask queue
  EventLoopState.log('callStack', 'Executing Promise Callback');
  EventLoopState.clearTask('microtasks', 'Promise Callback');
  await sleep(800);
  EventLoopState.clearTask('callStack', 'Executing Promise Callback');

  EventLoopState.log('callStack', 'Executing queueMicrotask Callback');
  EventLoopState.clearTask('microtasks', 'queueMicrotask Callback');
  
  // Simulate a microtask spawning ANOTHER microtask (Starvation)
  EventLoopState.log('microtasks', 'Nested Promise Callback');
  await sleep(800);
  EventLoopState.clearTask('callStack', 'Executing queueMicrotask Callback');
  
  EventLoopState.log('callStack', 'Executing Nested Promise Callback');
  EventLoopState.clearTask('microtasks', 'Nested Promise Callback');
  await sleep(800);
  EventLoopState.clearTask('callStack', 'Executing Nested Promise Callback');

  // Finally, the Event loop is allowed to move to the Macrotask queue
  EventLoopState.log('callStack', 'Executing Timeout Callback');
  EventLoopState.clearTask('macrotasks', 'Timeout Callback');
  await sleep(800);
  EventLoopState.clearTask('callStack', 'Executing Timeout Callback');
});

// Button 3: Clear & Reset
document.getElementById('btn-reset').addEventListener('click', () => {
  batcher.reset();
  EventLoopState.resetAll();
});

