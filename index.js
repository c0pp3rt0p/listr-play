#!/usr/bin/env node

const execa = require('execa');
const Listr = require('listr');
const { Observable } = require('rxjs');
var AWS = require('aws-sdk');

var s3 = new AWS.S3();
var cloudfront = new AWS.CloudFront();

// Parameters for a invalidation
var distributionID = 'E3P4LO0Y20RKJ8';//coreplus QA
var key = '*'

var params = {
    DistributionId: distributionID,
    InvalidationBatch: {
        CallerReference: '' + new Date().getTime(),
        Paths: {
            Quantity: 1,
            Items: ['/' + key]
        }
    }
};


// Create a CF invalidation
// returns a promise
function createInvalidation(params) {
    return new Promise((resolve, reject) => {
        cloudfront.createInvalidation(params, function (err, data) {
            if (err) reject(err);
            resolve(data);
        });
    });
}

// Get info about an invalidation
// Returns a promise
function getInvalidation(distributionID, id) {
    return new Promise((resolve, reject) => {
        cloudfront.getInvalidation({ DistributionId: distributionID, Id: id }, (err, data) => {
            if (err) reject(err);
            resolve(data);
        });
    });
}

function getCompletedInvalidation(distributionID, id, interval = 5000, maxAttempts = 720) {
    return new Promise((resolve, reject) => {
        //need to check status on an interval, 
        var attempts = 0;
        var timer = setInterval(() => {
            getInvalidation(distributionID, id).then(data => {
                attempts++;
                //console.log('Last status: ', data.Invalidation.Status, attempts);
                if (data.Invalidation.Status !== 'InProgress') {
                    resolve(data);
                    clearInterval(timer);
                }
                if (attempts > maxAttempts) {
                    reject('Exceeded, the maximum number of attempts while attempting to wait for the Cloudfront invalidation to complete,');
                    clearInterval(timer);
                }

            }, reason => {
                reject(reason);
                clearInterval(timer);
            }
            );
        }, interval);
    });
}

function _log(caption, object) {
    console.log(caption + JSON.stringify(object, true, '  '));
}

const tasks = new Listr([
    // {
    //     title: 'Git',
    //     task: () => {
    //         return new Listr([
    //             {
    //                 title: 'Checking git status',
    //                 task: (ctx, task) => execa('git', ['status', '--porcelain']).then(result => {
    //                     if (result.stdout !== '') {
    //                         //throw new Error('Unclean working tree. COmmit or stash changes first.');
    //                     }
    //                 }, reason => {
    //                     throw new Error('Failed');
    //                 })
    //             }
    //         ]);
    //     }
    // }
    // ,
    // {
    //     title: 'A long running process',
    //     task: () => {
    //         return new Observable(observer => {
    //             observer.next('Foo');

    //             setTimeout(() => {
    //                 observer.next('Bar');
    //             }, 2000);

    //             setTimeout(() => {
    //                 observer.complete();
    //             }, 4000);
    //         });
    //     }
    // },
    {
        title: 'Invalidate Couldfront',
        task: (ctx, task) => {
            return new Observable(observer => {
                if (!task.startTime) task.startTime = new Date();
                observer.next('Invalidating cloudfront');

                createInvalidation(params).then(data => {
                    observer.next('Invalidation InProgress');
                    getCompletedInvalidation(params.DistributionId, data.Invalidation.Id).then(data => {
                        observer.next('Invalidation Complete');
                        observer.complete();
                        let completionTime = new Date();
                        let duration = Math.floor((completionTime - task.startTime) / 1000);
                        task.title += ` - Completed in ${duration} seconds`;
                    }, reason => console.log(`Failed to complete invalidation. Reason: ${reason}`));
                });
            });
        }

    }
]);

// const tasks = new Listr([
//     {
//         title: 'Success',
//         task: () => {
//             return new Observable(observer => {
//                 observer.next('Foo');

//                 setTimeout(() => {
//                     observer.next('Bar');
//                 }, 2000);

//                 setTimeout(() => {
//                     observer.complete();
//                 }, 4000);
//             });
//         }
//     }
// ]);

tasks.run().catch(err => {
    //console.error(err);
});

