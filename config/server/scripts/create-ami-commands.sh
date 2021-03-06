# STEPS

# 1) get AMI from https://cloud.ubuntu.com/ami and follow the link.
#    as of right now (2014-11-14) the link is here: https://console.aws.amazon.com/ec2/home?region=us-east-1#launchAmi=ami-a88c0bc0
#    we're using us-east-1 instance-store amd64 instances
#    Launch the instance as desired.

# 2) Attach a 30gb EBS drive to the newly launched instance, as xvdf or whatever you want it to be called.
#    and note it directly below.
DEVICE=/dev/xvdf

# Format the drive if necessary with the following command
#sudo mkfs -t ext4 $DEVICE

#    Then create a mount point for the EBS drive
#    and mount the drive
sudo mkdir /mnt/ami
sudo mount $DEVICE /mnt/ami/

# 3) Set up the application.
#    For DocumentCloud the process goes like this (after you've scp'd up the scripts dir & github key)
git clone
cd ~/documentcloud
sudo ./config/server/scripts/setup_common_dependencies.sh
source /etc/profile.d/chruby.sh
gem install bundler
git clone git@github.com:documentcloud/documentcloud-secrets secrets
bundle install
rails runner -e production "puts Organization.count"
sudo mkdir /mnt/cloud_crowd
sudo chown ubuntu:ubuntu /mnt/cloud_crowd

# 4) Install the AWS command line tools:
#    a) We'll need to add the multiverse deb servers

# find all of the multiverse deb lines and uncomment them, skipping the backports repositories.
# then update w/ the new the package list
sudo perl -pi.orig -e   'next if /-backports/; s/^# (deb .* multiverse)$/$1/'   /etc/apt/sources.list
sudo apt-get update

#download pdfium deb
cd ~/
wget http://s3.amazonaws.com/s3.documentcloud.org/pdfium/libpdfium-dev_0.1%2Bgit20150303-1_amd64.deb
sudo dpkg -i libpdfium-dev_0.1+git20150217-1_amd64.deb
rm libpdfium-dev_0.1+git20150217-1_amd64.deb


# Install the AMI and API tools
sudo apt-get install ec2-ami-tools ec2-api-tools


ACCESS_KEY=$(egrep "aws_access_key"  secrets/secrets.yml | awk '{print $NF}')
SECRET_KEY=$(egrep "aws_secret_key"  secrets/secrets.yml | awk '{print $NF}')

ec2-describe-regions --aws-access-key $ACCESS_KEY --aws-secret-key $SECRET_KEY

sudo -E su
ec2-bundle-vol -k /home/ubuntu/documentcloud/secrets/keys/ami_signing.key -c /home/ubuntu/documentcloud/secrets/keys/ami_signing.pem --no-filter --exclude /etc/ssh/*_key* -u $(egrep "aws_account_id"  /home/ubuntu/documentcloud/secrets/secrets.yml | awk '{print $NF}') -r x86_64 -d /mnt/ami
exit

AMI_NAME=dc-worker-ephemeral-`date +'%Y-%m-%d'`

ec2-upload-bundle -b dcloud-ami/$AMI_NAME -m /mnt/ami/image.manifest.xml -a $ACCESS_KEY -s $SECRET_KEY --location US

ec2-register dcloud-ami/$AMI_NAME/image.manifest.xml -n $AMI_NAME -O $ACCESS_KEY -W $SECRET_KEY --region us-east-1


# Biblography
# http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/InstanceStorage.html
# http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-an-ami-instance-store.html#bundle-ami-prerequisites
#  Note that the above link is out of date.  Grub does not need to be updated (for one)
# http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-using-volumes.html
# http://docs.aws.amazon.com/IAM/latest/UserGuide/ManagingCredentials.html
# http://alestic.com/2012/05/aws-command-line-packages
# http://stackoverflow.com/questions/16480846/x-509-private-public-key

# Additional Reading
# http://sorcery.smugmug.com/2014/01/29/instance-store-hvm-amis-for-amazon-ec2/
# https://launchpad.net/~awstools-dev/+archive/ubuntu/awstools

# Reading about IOPS
# http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-workload-demand.html
# http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/monitoring-volume-status.html
# https://www.datadoghq.com/2013/08/aws-ebs-latency-and-iops-the-surprising-truth/
# https://www.datadoghq.com/2013/07/detecting-aws-ebs-performance-issues-with-datadog/
# http://www.datadoghq.com/wp-content/uploads/2013/07/top_5_aws_ec2_performance_problems_ebook.pdf
# http://www.slideshare.net/AmazonWebServices/ebs-webinarfinal
