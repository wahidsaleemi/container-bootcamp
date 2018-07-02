
# Use Persistent Azure Disks for mongodb database
In this example we will explore how to use already existing Azure disks as a Kubernetes volume in an AKS Cluster and use it to store the monogdb files.  We will create 2 Managed Disks in Azure for the monogodb and mount them to the DB pod. We will then import the monogdb data into the Azure disks and then validate the data by attching the disks to a fresh DB pod. 

NOTE: All the commands given below can be executed either on the Azure Shell or the CentOS jumpbox.

## Delete existing deployments
We will starrt with deleting all the existing deployments and making sure that the DB, WEB and API pods are not running.
```
[root@CentoS01 helper-files]# kubectl delete deployments --all
deployment.extensions "heroes-api-deploy" deleted
deployment.extensions "heroes-db-deploy" deleted
deployment.extensions "heroes-web-deploy" deleted

[root@CentoS01 helper-files]# kubectl get pods
No resources found.
```
## Create Azure disks
Before mounting an Azure-managed disk as a Kubernetes volume, the disk to be mounted must exist in the AKS node resource group.

Get the resource group name of AKS nodes with the az resource show command. Replace the resourcegroup name and AKS cluster name with the values from your lab.
```
NODEGROUP=`az resource show --resource-group <RG name of AKS cluster> --name <AKS Clustername> --resource-type Microsoft.ContainerService/managedClusters --query properties.nodeResourceGroup -o tsv`
```

### Create the datadisk for the mongodb in Azure
```
az disk create \
  --resource-group $NODEGROUP \
  --name mongodb-datadisk  \
  --size-gb 2 \
--sku Standard_LRS \
  --query id --output tsv
```
Once the disk has been created, you should see the last portion of the output like the following. This value is the disk ID, which is used when mounting the datadisk.
```
/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/MC_HackFest05_Kubecluster05_eastus/providers/Microsoft.Compute/disks/ mongodb-datadisk
```
### Create the configdisk for the mongodb in Azure
```
az disk create \
  --resource-group $NODEGROUP \
  --name mongodb-configdisk  \
  --size-gb 2 \
--sku Standard_LRS \
  --query id --output tsv
```
Once the disk has been created, you should see the last portion of the output like the following. This value is the disk ID, which is used when mounting the configdisk.
```
/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/MC_HackFest05_Kubecluster05_eastus/providers/Microsoft.Compute/disks/ mongodb-configdisk
```

## Mount the disks as volumes
Mount the Azure disks into your pod by configuring the volume in the deployment spec.

Create a new file named heroes-db-azdisk.yaml with the following contents. 

Update the diskURI with the disk IDs obtained while creating the respective disks. Also, take note of the mountPath, which is the path where the Azure disk is mounted inside the heroes-db pod.

```
apiVersion: v1
kind: Service
metadata:
  name: mongodb
  labels:
    name: mongodb
spec:
  type: ClusterIP
  ports:
  - name: http
    port: 27017
    targetPort: 27017
  selector:
    name: heroes-db
---
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name:  heroes-db-deploy
  labels:
    name:  heroes-db-azdisk
spec:
  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
    type: RollingUpdate
  template:
    metadata:
      labels:
        name:  heroes-db-azdisk
    spec:
      imagePullSecrets:
        - name: acr-secret
      containers:
      - image:  deepuacr01.azurecr.io/azureworkshop/rating-db:v1
        name:  heroes-db-cntnr
        resources:
          requests:
            cpu: "20m"
            memory: "55M"
        ports:
        - containerPort:  27017
          name:  heroes-db-azdisk
        volumeMounts:
        - mountPath: /data/db
          name: azuredisk-db
        - mountPath: /data/configdb
          name: azuredisk-configdb
        imagePullPolicy: Always
      volumes:
        - name: azuredisk-db
          azureDisk:
            kind: Managed
            diskName: mongodb-datadisk
            diskURI: /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/MC_HackFest01_HackFest01_eastus/providers/Microsoft.Compute/disks/mongodb-datadisk
        - name: azuredisk-configdb
          azureDisk:
            kind: Managed
            diskName: mongodb-configdisk
            diskURI: /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/MC_HackFest01_HackFest01_eastus/providers/Microsoft.Compute/disks/mongodb-configdisk
       restartPolicy: Always
```

## Create the DB, WEB and API Pods

Apply the yaml file to create the heroes-db pod
```
Kubectl apply -f heroes-db-azdisk.yaml
```
Edit the heroes-web-api.yaml file and make sure that the MONGO_URI is pointing to the mongo pod. 
```
env:
        - name:  MONGODB_URI
          value: mongodb://mongodb:27017/webratings
        ports:
```
Apply the yaml file to create the heroes-web and heroes-api pods
```
kubectl apply -f heroes-web-api.yaml
```
Wait for all the pods to be in the Running status. 
```
[root@CentoS01 helper-files]# kubectl get pod
NAME                                 READY     STATUS    RESTARTS   AGE
heroes-api-deploy-77f5fdcbb-xxq46    1/1       Running   0          8m
heroes-db-deploy-678745655b-f82vj    1/1       Running   0          4m
heroes-web-deploy-5dffc9c976-cdll5   1/1       Running   0          8m
```

## Verify the mountpoints and the databases
Verify the mount points  of azure disks inside the DB pod. 
You should see 2 disks of 2GB each mounted to the /data/db and /data/configdb paths. 

```
[root@CentoS01 helper-files]# kubectl exec -it heroes-db-deploy-678745655b-f82vj bash

root@heroes-db-deploy-678745655b-f82vj:/# df -Th
Filesystem     Type     Size  Used Avail Use% Mounted on
overlay        overlay   30G  4.2G   25G  15% /
tmpfs          tmpfs    1.7G     0  1.7G   0% /dev
tmpfs          tmpfs    1.7G     0  1.7G   0% /sys/fs/cgroup
/dev/sdc       ext4     2.0G  304M  1.5G  17% /data/db
/dev/sdd       ext4     2.0G  3.0M  1.8G   1% /data/configdb
/dev/sda1      ext4      30G  4.2G   25G  15% /etc/hosts
shm            tmpfs     64M     0   64M   0% /dev/shm
tmpfs          tmpfs    1.7G   12K  1.7G   1% /run/secrets/kubernetes.io/serviceaccount
tmpfs          tmpfs    1.7G     0  1.7G   0% /sys/firmware
root@heroes-db-deploy-678745655b-f82vj:/#
```
Run the mongo command and list the databases by running the command 'show dbs' in the mongo shell. 
```
root@heroes-db-deploy-678745655b-vq7l5:/# mongo
MongoDB shell version v3.6.1
connecting to: mongodb://127.0.0.1:27017
MongoDB server version: 3.6.1
>
> show dbs
admin       0.000GB
config      0.000GB
local       0.000GB
>
```

At this point there will be only 3 default databases namely admin, local and config.  

### Import the webrating database

```
root@heroes-db-deploy-678745655b-f82vj:/#cd /
root@heroes-db-deploy-678745655b-f82vj:/# ./import.sh
2018-07-02T11:48:16.546+0000    connected to: localhost
2018-07-02T11:48:16.608+0000    imported 4 documents
2018-07-02T11:48:16.617+0000    connected to: localhost
2018-07-02T11:48:16.710+0000    imported 72 documents
2018-07-02T11:48:16.719+0000    connected to: localhost
2018-07-02T11:48:16.787+0000    imported 2 documents
```

Run the mongo command and list the databases by running the command 'show dbs' in the mongo shell.  
```
root@heroes-db-deploy-678745655b-vq7l5:/# mongo
MongoDB shell version v3.6.1
connecting to: mongodb://127.0.0.1:27017
MongoDB server version: 3.6.1
>
> show dbs
admin       0.000GB
config      0.000GB
local       0.000GB
webratings  0.000GB
>
```
After the successful import, you will see the webratings database also listed in the output. 

NOTE: The imported webratings database information will be stored in the mounted Azure disks.

Browse the heroes web application and add some ratings. 

Now delete the database pod deployment
```
kubectl delete deployment heroes-db-deploy
```
Now, again apply the yaml file for the db pod, heroes-db-azdisk.yaml to recreate the DB pod
```
kubectl apply -f heroes-db-azdisk.yaml 
```
Verify the mount points of azure disks inside the newly created DB pod. 

```
[root@CentoS01 helper-files]# kubectl exec -it heroes-db-deploy-678745655b-f82vj bash
root@heroes-db-deploy-678745655b-f82vj:/# df -Th
Filesystem     Type     Size  Used Avail Use% Mounted on
overlay        overlay   30G  4.2G   25G  15% /
tmpfs          tmpfs    1.7G     0  1.7G   0% /dev
tmpfs          tmpfs    1.7G     0  1.7G   0% /sys/fs/cgroup
/dev/sdc       ext4     2.0G  304M  1.5G  17% /data/db
/dev/sdd       ext4     2.0G  3.0M  1.8G   1% /data/configdb
/dev/sda1      ext4      30G  4.2G   25G  15% /etc/hosts
shm            tmpfs     64M     0   64M   0% /dev/shm
tmpfs          tmpfs    1.7G   12K  1.7G   1% /run/secrets/kubernetes.io/serviceaccount
tmpfs          tmpfs    1.7G     0  1.7G   0% /sys/firmware
root@heroes-db-deploy-678745655b-f82vj:/#
```
## Validate that the databases are populated from the Azure Disks. 
Run the mongo command and list the databases. 
The DB pod shoud now automatically use the database files stored in the mounted Azure disks and will populate the database.
```
root@heroes-db-deploy-678745655b-vq7l5:/# mongo
MongoDB shell version v3.6.1
connecting to: mongodb://127.0.0.1:27017
MongoDB server version: 3.6.1
>
> show dbs
admin       0.000GB
config      0.000GB
local       0.000GB
webratings  0.000GB
>
```

