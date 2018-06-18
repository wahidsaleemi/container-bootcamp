4.	function kubeJobRunner (config, k) {
5.	    k.storage.enabled = false
6.	    k.image = "lachlanevenson/k8s-kubectl:v1.8.2"
7.	    k.tasks = [
8.	        `kubectl set image deployment/heroes-web-deploy heroes-web-cntnr=deepuacr01.azurecr.io/azureworkshop/rating-web:${config.get("imageTag")}`
9.	    ]
10.	}
