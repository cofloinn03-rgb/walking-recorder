(() => {
    'use strict';
    class WalkUploader {
        constructor({write, stamp, onChange}) {
            this.write = write; this.stamp = stamp; this.notify = onChange;
            this.tasks = []; this.buffer = []; this.running = false; this.failed = false;
            this.recording = false; this.total = 0; this.confirmed = 0; this.id = null;
            this.error = ''; this.tick = null; this.uid = null; this.batch = 0;
        }
        state() {
            return {id:this.id, uid:this.uid, total:this.total, confirmed:this.confirmed,
                failed:this.failed, error:this.error, recording:this.recording};
        }
        idle() { return !this.recording && !this.running && !this.tasks.length && !this.buffer.length; }
        begin(uid, id, startedAt) {
            if (!this.idle()) throw new Error('Previous upload not finished');
            this.uid=uid; this.id=id; this.total=0; this.confirmed=0; this.batch=0;
            this.failed=false; this.error=''; this.recording=true;
            this.base=`users/${uid}/walkingSessions/${id}`;
            this.tasks.push({path:this.base+'/metadata', count:0, value:{
                    schemaVersion:1, startedAt, serverStartedAt:this.stamp(), status:'recording',
                    units:'m/s^2', gravityExcluded:true, nominalUploadIntervalMs:1000,
                    sampleTiming:'browser event receipt UTC; device-clock anchored'
                }});
            this.tick=setInterval(()=>this.flush(),1000);
            this.notify(); this.pump();
        }
        add(row) {
            if (!this.recording) return;
            const [time, ax, ay, az, atotal]=row;
            if (typeof time !== 'string' || !Number.isFinite(Date.parse(time)) || ![ax,ay,az,atotal].every(v=>typeof v==='number' && Number.isFinite(v))) return;
            this.buffer.push({sequence:this.total, time, ax, ay, az, atotal});
            this.total++;
            // Refresh counters at most once per batch instead of making extra writes per sample.
        }
        flush() {
            // Bound each request while retaining every reading catch up can span more batches.
            while (this.buffer.length) {
                const readings=this.buffer.splice(0,120);
                const key=String(this.batch++).padStart(8,'0');
                this.tasks.push({path:this.base+'/batches/'+key,count:readings.length,value:{
                        batchId:key, count:readings.length, firstSequence:readings[0].sequence,
                        lastSequence:readings[readings.length-1].sequence,
                        queuedAt:new Date().toISOString(), serverReceivedAt:this.stamp(), readings
                    }});
            }
            this.notify(); this.pump();
        }
        finish(meta) {
            if (!this.recording) return;
            this.recording=false; clearInterval(this.tick); this.tick=null;
            this.flush();
            this.tasks.push({path:this.base+'/completion',count:0,value:{
                    ...meta, totalReadings:this.total, status:'complete', serverCompletedAt:this.stamp()
                }});
            this.notify(); this.pump();
        }
        async pump() {
            if (this.running || this.failed) return;
            this.running=true;
            try {
                while (this.tasks.length) {
                    const task=this.tasks[0];
                    await this.write(task.path,task.value);
                    // Only server acknowledged writes count as uploaded
                    this.confirmed+=task.count;
                    this.tasks.shift(); this.notify();
                }
            } catch(error) {
                this.failed=true; this.error=error.code || 'write error';
                // Retain the first task a retry overwrites stable path, not a new record
            } finally { this.running=false; this.notify(); }
        }
        retry() { this.failed=false; this.error=''; this.pump(); this.notify(); }
    }
    window.WalkUploader=WalkUploader;
})();
